/* ══════════════════════════════════════════════════════════
   corpus.js — Pearl-poet full-text database
   Sources (public domain, Project Gutenberg):
     Pearl + Cleanness + Patience: ebook 30282
     Sir Gawain and the Green Knight: ebook 14568
   Fetched once at runtime, cached 7 days in localStorage.
   ══════════════════════════════════════════════════════════ */
'use strict';

/* ── Source URLs ─────────────────────────────────────────── */
const CORPUS_SOURCES = {
  pcp:  'https://www.gutenberg.org/cache/epub/30282/poems.html',   // Pearl + Cleanness + Patience
  sggk: 'https://www.gutenberg.org/cache/epub/14568/pg14568-images.html'
};
const PROXY = url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
const CACHE_KEY = 'pearl_corpus_v2';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

/* ── Public state ────────────────────────────────────────── */
// Each poem is an array of { num: int, text: string }
let CORPUS = null;
let CORPUS_STATUS = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
const CORPUS_LISTENERS = [];

/* ══════════════════════════════════════════════════════════
   LOAD
   ══════════════════════════════════════════════════════════ */
async function loadCorpus() {
  if (CORPUS_STATUS === 'ready' || CORPUS_STATUS === 'loading') return;

  // Try localStorage cache first
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const { savedAt, corpus } = JSON.parse(raw);
      if (Date.now() - savedAt < CACHE_TTL && corpus) {
        CORPUS = corpus;
        CORPUS_STATUS = 'ready';
        notifyListeners('ready', null);
        return;
      }
    }
  } catch {}

  CORPUS_STATUS = 'loading';
  notifyListeners('loading', null);

  try {
    const [pcpHtml, sggkHtml] = await Promise.all([
      fetchText(CORPUS_SOURCES.pcp),
      fetchText(CORPUS_SOURCES.sggk)
    ]);

    const pearl     = parsePoem(pcpHtml,  'pearl',     'cleanness');
    const cleanness = parsePoem(pcpHtml,  'cleanness', 'patience');
    const patience  = parsePoem(pcpHtml,  'patience',  null);
    const sggk      = parsePoem(sggkHtml, null,        null);

    CORPUS = { pearl, cleanness, patience, sggk };
    CORPUS_STATUS = 'ready';

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), corpus: CORPUS }));
    } catch {}

    notifyListeners('ready', null);
  } catch (err) {
    CORPUS_STATUS = 'error';
    notifyListeners('error', err.message);
  }
}

/* ── Fetch with CORS proxy fallback ──────────────────────── */
async function fetchText(url) {
  // Try direct first
  try {
    const res = await fetch(url, { headers: { 'Accept': 'text/html' } });
    if (res.ok) return await res.text();
  } catch {}

  // Fallback: allorigins CORS proxy
  const res = await fetch(PROXY(url));
  if (!res.ok) throw new Error(`Proxy fetch failed: ${res.status}`);
  const data = await res.json();
  return data.contents || '';
}

/* ══════════════════════════════════════════════════════════
   PARSE
   Extract poem lines from Gutenberg HTML.
   A line is kept if it:
     - contains þ, ȝ, æ, ð (thorn/yogh = unmistakable ME)
     - OR matches common ME word patterns
     - AND is between 10–160 chars after cleaning
     - AND isn't a heading/note/folio marker
   ══════════════════════════════════════════════════════════ */
function parsePoem(html, startAnchor, endAnchor) {
  const parser  = new DOMParser();
  const doc     = parser.parseFromString(html, 'text/html');
  const lines   = [];
  let   lineNum = 0;
  let   inPoem  = startAnchor === null; // true from start if no anchor needed

  // Walk every element in document order
  const all = doc.body.querySelectorAll('*');
  for (const el of all) {
    // Check if we've reached the start anchor
    if (!inPoem && startAnchor) {
      const id   = el.getAttribute('id')   || '';
      const name = el.getAttribute('name') || '';
      if (id === startAnchor || name === startAnchor ||
          el.textContent.toLowerCase().includes(`the ${startAnchor}`)) {
        inPoem = true;
        continue;
      }
    }
    if (!inPoem) continue;

    // Stop at the end anchor
    if (endAnchor) {
      const id   = el.getAttribute('id')   || '';
      const name = el.getAttribute('name') || '';
      if (id === endAnchor || name === endAnchor) break;
    }

    // Only consider block text elements, not nested ones we'll hit again
    const tag = el.tagName.toLowerCase();
    if (!['p', 'div', 'li', 'br', 'span'].includes(tag)) continue;
    if (el.children.length > 2) continue; // skip large containers

    const raw     = el.textContent || '';
    const cleaned = cleanLine(raw);
    if (cleaned && isMELine(cleaned)) {
      lineNum++;
      lines.push({ num: lineNum, text: cleaned });
    }
  }

  return lines;
}

/* ── Clean a raw text node ───────────────────────────────── */
function cleanLine(raw) {
  return raw
    .replace(/\[\d+\]/g, '')          // footnote refs [1]
    .replace(/\*[^*]*\*/g, match =>   // *abbrev* expansions: keep inner text
      match.slice(1, -1).replace(/\*/g, ''))
    .replace(/[^\S\n]+/g, ' ')        // collapse whitespace
    .replace(/^\s+|\s+$/g, '')        // trim
    .replace(/^[\d\s]+$/, '');        // skip bare line numbers
}

/* ── Heuristic: is this a Middle English verse line? ──────── */
const ME_CHARS  = /[þȝæðÞȜÆÐ]/;
const ME_WORDS  = /\b(watz|þat|þe|wyth|hyr|þay|ȝe|quen|kynde|ryȝt|myȝt|bryȝt|moȝt|boȝt|þurȝ|syþen|watȝ|coþe|nayþer|oþer|vche|suche|swyþe)\b/i;
const EDITORIAL = /^\s*(fol\.|ms\.|see|note:|cf\.|ibid|op\.|transl|edit|page|appendix|\d+[\s.]\d*$)/i;

function isMELine(text) {
  if (!text || text.length < 12 || text.length > 180) return false;
  if (EDITORIAL.test(text)) return false;
  if (/^\s*[A-Z\s]+\s*$/.test(text)) return false;     // all-caps headings
  if (/^\s*[\d.,;:\-–—]+\s*$/.test(text)) return false; // bare punctuation/nums
  return ME_CHARS.test(text) || ME_WORDS.test(text);
}

/* ══════════════════════════════════════════════════════════
   SEARCH
   findPassage(poem, pastedText)
   Returns { found, lines: Line[], lineStart, lineEnd }
   ══════════════════════════════════════════════════════════ */
function findPassage(poem, pastedText) {
  if (!CORPUS || !CORPUS[poem]) return { found: false };

  const corpus   = CORPUS[poem];
  const haystack = corpus.map(l => normalizeForSearch(l.text));

  // Build search tokens from the pasted text (first 2 non-trivial lines)
  const inputLines = pastedText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 4);
  if (!inputLines.length) return { found: false };

  const needle1 = normalizeForSearch(inputLines[0]);
  const needle2 = inputLines[1] ? normalizeForSearch(inputLines[1]) : null;

  // Find the first line in the corpus
  let matchIdx = -1;
  for (let i = 0; i < haystack.length; i++) {
    if (similarity(haystack[i], needle1) >= 0.6) {
      // If we have a second needle, confirm match
      if (!needle2 || i + 1 >= haystack.length ||
          similarity(haystack[i + 1], needle2) >= 0.5) {
        matchIdx = i;
        break;
      }
    }
  }

  if (matchIdx === -1) return { found: false };

  // Determine end of passage
  const passageLen = inputLines.length;
  const lineStart  = corpus[matchIdx].num;
  const lineEnd    = corpus[Math.min(matchIdx + passageLen - 1, corpus.length - 1)].num;

  // Return match + 3 lines of context either side
  const ctxStart = Math.max(0, matchIdx - 3);
  const ctxEnd   = Math.min(corpus.length - 1, matchIdx + passageLen + 2);
  const context  = corpus.slice(ctxStart, ctxEnd + 1);

  return { found: true, lineStart, lineEnd, context, matchIdx };
}

/* ── Normalize a line for fuzzy search ──────────────────────
   Lowercase, remove punctuation, expand thorn/yogh to ascii  */
function normalizeForSearch(text) {
  return text
    .toLowerCase()
    .replace(/þ/g, 'th')
    .replace(/ȝ/g, 'y')
    .replace(/æ/g, 'ae')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ── Simple word-overlap similarity (Jaccard) ──────────────── */
function similarity(a, b) {
  const sa = new Set(a.split(' ').filter(w => w.length > 2));
  const sb = new Set(b.split(' ').filter(w => w.length > 2));
  let   intersection = 0;
  for (const w of sa) { if (sb.has(w)) intersection++; }
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/* ══════════════════════════════════════════════════════════
   STATUS CALLBACKS
   ══════════════════════════════════════════════════════════ */
function onCorpusReady(fn) {
  if (CORPUS_STATUS === 'ready') { fn('ready', null); return; }
  CORPUS_LISTENERS.push(fn);
}
function notifyListeners(status, err) {
  CORPUS_LISTENERS.forEach(fn => fn(status, err));
  CORPUS_LISTENERS.length = 0;
}

/* ── Corpus stats ────────────────────────────────────────── */
function corpusStats() {
  if (!CORPUS) return null;
  return {
    pearl:     CORPUS.pearl.length,
    sggk:      CORPUS.sggk.length,
    patience:  CORPUS.patience.length,
    cleanness: CORPUS.cleanness.length
  };
}

/* ── Clear cache (for debug/refresh) ────────────────────── */
function clearCorpusCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
  CORPUS = null;
  CORPUS_STATUS = 'idle';
}

/* ── Auto-start loading when the page is ready ─────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Start loading in background — explore.js will pick it up
  loadCorpus().catch(() => {});
});
