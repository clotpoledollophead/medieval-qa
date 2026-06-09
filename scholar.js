/* ══════════════════════════════════════════════════════════
   functions/api/scholar.js — Cloudflare Pages Function
   Scrapes Google Scholar via:
     1. RSS output  (?output=rss) — clean XML, less blocked
     2. HTML fallback             — full result page parsing

   GET /api/scholar?q=QUERY&n=10
   Returns JSON array of papers, or { error, papers[], debug }
   ══════════════════════════════════════════════════════════ */

const CACHE_TTL = 20 * 60; // 20 min server cache

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors() });
  }

  const url   = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(parseInt(url.searchParams.get('n') || '10', 10), 20);

  if (!query) return json({ error: 'Missing q', papers: [] }, 400);

  /* ── Cloudflare cache ─────────────────────────────────── */
  const cache    = caches.default;
  const cacheKey = new Request(
    `https://scholar.google.com/__cache__?q=${encodeURIComponent(query)}&n=${limit}`
  );
  const hit = await cache.match(cacheKey);
  if (hit) return addCors(hit);

  /* ── Build query ladder ──────────────────────────────────
     If the specific query returns < 5 results, retry with
     progressively simpler queries until we have >= 5 or
     we run out of alternatives.                          */
  const MIN_RESULTS = 5;
  const queries = buildQueryLadder(query);
  let papers = [];
  let debug  = { queries: [] };

  for (const q of queries) {
    // RSS first, HTML fallback
    const rssResult = await tryRSS(q, limit);
    debug.queries.push({ q, method: 'rss', ...rssResult.debug });

    if (rssResult.papers.length >= MIN_RESULTS) {
      papers = rssResult.papers;
      debug.method = 'rss';
      debug.finalQuery = q;
      break;
    }

    const htmlResult = await tryHTML(q, limit);
    debug.queries.push({ q, method: 'html', ...htmlResult.debug });

    const combined = dedupePapers([...rssResult.papers, ...htmlResult.papers]);
    if (combined.length >= MIN_RESULTS || q === queries[queries.length - 1]) {
      papers = combined;
      debug.method = combined.length ? 'html+rss' : 'none';
      debug.finalQuery = q;
      break;
    }
  }

  /* ── Sort newest first ────────────────────────────────── */
  papers.sort((a, b) => (b.year || 0) - (a.year || 0));

  const payload = JSON.stringify(papers.length
    ? papers
    : { error: 'No results from Scholar', papers: [], debug }
  );

  const response = new Response(payload, {
    headers: { ...cors(), 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL}` }
  });
  if (papers.length) context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

/* ══════════════════════════════════════════════════════════
   QUERY LADDER
   Builds 3 progressively broader versions of a query so we
   can retry and guarantee >= 5 results.
   ══════════════════════════════════════════════════════════ */
function buildQueryLadder(query) {
  const q1 = query;   // original (most specific)

  // q2: strip boolean OR, keep all quoted phrases joined with spaces
  const q2 = query
    .replace(/OR/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // q3: remove all quotes — plain keyword search
  const q3 = query
    .replace(/"([^"]+)"/g, '$1')
    .replace(/OR/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Deduplicate identical strings
  return [...new Set([q1, q2, q3])];
}

function dedupePapers(papers) {
  const seen = new Set();
  return papers.filter(p => {
    const key = (p.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ══════════════════════════════════════════════════════════
   RSS APPROACH
   https://scholar.google.com/scholar?q=…&output=rss&num=N&scisbd=1
   Returns <rss> XML — far easier to parse than the HTML page
   and historically less aggressively rate-limited.
   ══════════════════════════════════════════════════════════ */
async function tryRSS(query, limit) {
  const url =
    `https://scholar.google.com/scholar` +
    `?q=${encodeURIComponent(query)}` +
    `&hl=en&num=${limit}&output=rss&scisbd=1`;

  let body = '', status = 0;
  try {
    const res = await fetch(url, { headers: headers(), redirect: 'follow' });
    status = res.status;
    body   = await res.text();
  } catch (e) {
    return { papers: [], debug: { error: e.message, status } };
  }

  if (status !== 200 || !body.includes('<rss')) {
    return { papers: [], debug: { status, snippet: body.slice(0, 300) } };
  }

  const papers = parseRSS(body);
  return { papers, debug: { status, parsed: papers.length } };
}

function parseRSS(xml) {
  const papers = [];
  const items  = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

  for (const item of items) {
    const title   = cdataOrTag(item, 'title');
    const link    = cdataOrTag(item, 'link').trim();
    const desc    = cdataOrTag(item, 'description');

    const clean   = stripTags(desc);
    const yearHit = clean.match(/\b(19|20)\d{2}\b/g);
    const year    = yearHit ? parseInt(yearHit[yearHit.length - 1], 10) : 0;

    // Author line is often the first sentence of the description
    const authorLine = clean.split('\n')[0] || '';
    const dashParts  = authorLine.split(/\s*[-–]\s*/);
    const authors    = dashParts[0] ? dashParts[0].trim() : '';
    const journal    = dashParts[1] ? dashParts[1].replace(/,?\s*(19|20)\d{2}.*$/, '').trim() : '';

    const abstract = clean.length > 250 ? clean.slice(0, 250) + '…' : clean;

    if (title && link) {
      papers.push({ title: stripTags(title), authors, year, journal, abstract, url: link, source: 'Google Scholar' });
    }
  }
  return papers;
}

function cdataOrTag(xml, tag) {
  // Match <tag><![CDATA[…]]></tag> or plain <tag>…</tag>
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`, 'i'
  );
  const m = xml.match(re);
  return m ? (m[1] !== undefined ? m[1] : m[2] || '') : '';
}

/* ══════════════════════════════════════════════════════════
   HTML FALLBACK
   Parses the standard Scholar search-results page.
   Uses the stable class names gs_ri / gs_rt / gs_a / gs_rs.
   ══════════════════════════════════════════════════════════ */
async function tryHTML(query, limit) {
  const url =
    `https://scholar.google.com/scholar` +
    `?q=${encodeURIComponent(query)}&hl=en&num=${limit}&scisbd=1`;

  let body = '', status = 0;
  try {
    const res = await fetch(url, { headers: headers(), redirect: 'follow' });
    status = res.status;
    body   = await res.text();
  } catch (e) {
    return { papers: [], debug: { error: e.message, status } };
  }

  if (status !== 200) {
    return { papers: [], debug: { status, snippet: body.slice(0, 300) } };
  }

  // Detect consent / CAPTCHA pages
  const lower = body.toLowerCase();
  if (
    lower.includes('before you continue') ||
    lower.includes('consent.google') ||
    lower.includes('unusual traffic') ||
    lower.includes('captcha') ||
    body.length < 3000
  ) {
    return { papers: [], debug: { status, blocked: true, snippet: body.slice(0, 400) } };
  }

  const papers = parseHTML(body);
  return { papers, debug: { status, parsed: papers.length, bodyLen: body.length } };
}

function parseHTML(html) {
  const papers = [];

  // Each result block starts with a div containing gs_ri
  const blocks = html.split(/<div[^>]+class="gs_ri"[^>]*>/i);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // Title + URL from <h3 class="gs_rt"><a href="…">TITLE</a>
    const titleM = block.match(/<h3[^>]*class="[^"]*gs_rt[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleM) continue;
    const url   = titleM[1] || '';
    const title = stripTags(titleM[2]).trim();
    if (!title) continue;

    // Author / venue line <div class="gs_a">
    const authorM  = block.match(/<div[^>]+class="[^"]*gs_a[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const authorLine = authorM ? stripTags(authorM[1]).trim() : '';
    const yearHit    = authorLine.match(/\b(19|20)\d{2}\b/g);
    const year       = yearHit ? parseInt(yearHit[yearHit.length - 1], 10) : 0;
    const parts      = authorLine.split(/\s*[-–]\s*/);
    const authors    = parts[0] ? parts[0].trim() : '';
    const journal    = parts[1] ? parts[1].replace(/,?\s*(19|20)\d{2}.*$/, '').trim() : '';

    // Snippet <div class="gs_rs">
    const snipM   = block.match(/<div[^>]+class="[^"]*gs_rs[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const abstract = snipM ? stripTags(snipM[1]).trim().slice(0, 280) : '';

    papers.push({ title, authors, year, journal, abstract, url, source: 'Google Scholar' });
  }
  return papers;
}

/* ── Shared helpers ──────────────────────────────────────── */
function stripTags(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function headers() {
  return {
    // Full Chrome 124 UA
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/124.0.0.0 Safari/537.36',
    'Accept':           'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language':  'en-US,en;q=0.9',
    'Accept-Encoding':  'gzip, deflate, br',
    'Connection':       'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest':   'document',
    'Sec-Fetch-Mode':   'navigate',
    'Sec-Fetch-Site':   'none',
    'Sec-Fetch-User':   '?1',
    'sec-ch-ua':        '"Chromium";v="124","Google Chrome";v="124","Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    // GDPR consent cookie — avoids the "Before you continue" redirect
    'Cookie': 'CONSENT=YES+cb; SOCS=CAESHAgCEhJnd3NfMjAyNDAxMDItMF9SQzEaAmVuIAEaBgiAo46sBg',
  };
}

function cors() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(), 'Content-Type': 'application/json' }
  });
}

function addCors(res) {
  const r = new Response(res.body, res);
  Object.entries(cors()).forEach(([k, v]) => r.headers.set(k, v));
  return r;
}