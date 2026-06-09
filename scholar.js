/* ══════════════════════════════════════════════════════════
   functions/api/scholar.js — Cloudflare Pages Function
   Server-side Google Scholar scraper.
   Deploy alongside your existing /api/ask function.

   Endpoint: GET /api/scholar?q=ENCODED_QUERY&n=10
   Returns:  JSON array of paper objects, or { error, papers: [] }

   Caches each query for 30 min using the Cloudflare Cache API
   to avoid hammering Scholar on repeated requests.
   ══════════════════════════════════════════════════════════ */

const CACHE_TTL = 30 * 60; // seconds

export async function onRequest(context) {
  const { request } = context;

  // ── CORS preflight ────────────────────────────────────────
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  const url   = new URL(request.url);
  const query = url.searchParams.get('q') || '';
  const limit = Math.min(parseInt(url.searchParams.get('n') || '10', 10), 20);

  if (!query.trim()) {
    return jsonResponse({ error: 'Missing q parameter', papers: [] }, 400);
  }

  // ── Cache lookup ──────────────────────────────────────────
  const cache    = caches.default;
  const cacheKey = new Request(
    `https://scholar.google.com/__cache__?q=${encodeURIComponent(query)}&n=${limit}`,
    { method: 'GET' }
  );
  const cached = await cache.match(cacheKey);
  if (cached) return addCors(cached);

  // ── Fetch from Scholar ────────────────────────────────────
  const scholarUrl =
    `https://scholar.google.com/scholar` +
    `?q=${encodeURIComponent(query)}` +
    `&hl=en&num=${limit}&scisbd=1`;       // scisbd=1 = sort by date

  let html;
  try {
    const res = await fetch(scholarUrl, {
      headers: scholarHeaders(),
      redirect: 'follow',
      cf: { cacheTtl: 0, cacheEverything: false }
    });

    // Scholar sometimes returns 429 (rate-limit) or redirects to a CAPTCHA page
    if (!res.ok) {
      return jsonResponse({ error: `Scholar HTTP ${res.status}`, papers: [] }, 200);
    }

    html = await res.text();
  } catch (err) {
    return jsonResponse({ error: err.message, papers: [] }, 200);
  }

  // Detect CAPTCHA / block page
  if (isBlocked(html)) {
    return jsonResponse({ error: 'Scholar blocked the request (CAPTCHA). Try again later.', papers: [] }, 200);
  }

  // ── Parse ─────────────────────────────────────────────────
  const papers = parseScholar(html, limit);

  // ── Cache result ──────────────────────────────────────────
  const body     = JSON.stringify(papers);
  const response = new Response(body, {
    headers: {
      ...corsHeaders(),
      'Content-Type':  'application/json',
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
    }
  });
  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

/* ── Parser ──────────────────────────────────────────────────
   Google Scholar result HTML structure (as of 2024):
     <div class="gs_ri">
       <h3 class="gs_rt"><a href="URL">TITLE</a></h3>
       <div class="gs_a">Authors - Journal, YEAR - Publisher</div>
       <div class="gs_rs">Abstract snippet…</div>
     </div>
   ─────────────────────────────────────────────────────────── */
function parseScholar(html, limit) {
  const papers = [];

  // Split on each result container
  const blocks = html.split(/<div[^>]+class="gs_ri"[^>]*>/);
  for (let i = 1; i < blocks.length && papers.length < limit; i++) {
    const block = blocks[i];

    // Title + URL
    const titleMatch = block.match(/<h3[^>]*class="gs_rt"[^>]*>.*?<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const url   = titleMatch[1] || '';
    const title = stripTags(titleMatch[2]).trim();
    if (!title) continue;

    // Author/venue/year line (.gs_a)
    const authorMatch = block.match(/<div[^>]+class="gs_a"[^>]*>([\s\S]*?)<\/div>/i);
    const authorLine  = authorMatch ? stripTags(authorMatch[1]).trim() : '';

    // Year: last 4-digit year in the author line
    const yearMatches = authorLine.match(/\b(19|20)\d{2}\b/g);
    const year = yearMatches ? parseInt(yearMatches[yearMatches.length - 1], 10) : 0;

    // Authors and journal: "A. Smith, B. Jones - Nature, 2021 - springer.com"
    const lineParts = authorLine.split(/\s*[-–]\s*/);
    const authors  = lineParts[0] ? lineParts[0].trim() : '';
    const journal  = lineParts[1] ? lineParts[1].replace(/,?\s*(19|20)\d{2}.*$/, '').trim() : '';

    // Abstract snippet (.gs_rs)
    const snipMatch = block.match(/<div[^>]+class="gs_rs"[^>]*>([\s\S]*?)<\/div>/i);
    const abstract  = snipMatch ? stripTags(snipMatch[1]).trim() : '';

    papers.push({ title, authors, year, journal, abstract, url, source: 'Google Scholar' });
  }

  // Sort newest-first
  return papers.sort((a, b) => (b.year || 0) - (a.year || 0));
}

/* ── Helpers ─────────────────────────────────────────────── */
function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isBlocked(html) {
  const lower = html.toLowerCase();
  return (
    lower.includes('unusual traffic') ||
    lower.includes('captcha') ||
    lower.includes('id="captcha"') ||
    lower.includes('recaptcha') ||
    lower.length < 2000        // suspiciously short = likely an error page
  );
}

function scholarHeaders() {
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer':         'https://scholar.google.com/',
    'DNT':             '1',
  };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

function addCors(response) {
  const r = new Response(response.body, response);
  Object.entries(corsHeaders()).forEach(([k, v]) => r.headers.set(k, v));
  return r;
}
