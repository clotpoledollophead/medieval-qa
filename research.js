/* ══════════════════════════════════════════════════════════
   research.js — Live Research Dashboard
   Sources: OpenAlex · Semantic Scholar · CrossRef
   All free, no API key, CORS-friendly, merged + deduped
   ══════════════════════════════════════════════════════════ */
'use strict';

const CACHE_TTL = 24 * 60 * 60 * 1000;

/* ── Mandatory anchor for OpenAlex (supports boolean search) ─ */
const ANCHOR =
  '("cotton nero" OR "pearl-poet" OR "pearl poet" OR ' +
  '"sir gawain and the green knight" OR "sir gawain green knight" OR ' +
  '"cleanness poem" OR "purity poem" OR "patience poem" OR ' +
  '"pearl poem" OR "pearl manuscript" OR "gawain poet")';

/* ── Client-side relevance filter (applied to all sources) ───
   Drops anything whose title + abstract contains none of these. */
const RELEVANCE_TERMS = [
  'cotton nero', 'pearl-poet', 'pearl poet', 'gawain poet',
  'sir gawain', 'green knight', 'pearl poem', 'the pearl',
  'pearl dreamer', 'pearl maiden', 'pearl manuscript',
  'cleanness', 'patience poem', 'patience jonah',
  'alliterative revival', 'alliterative tradition',
  'nero a.x', 'northwest midlands', 'middle english alliterative',
  'andrew and waldron', 'andrew & waldron',
];

function isRelevant(paper) {
  const hay = `${paper.title} ${paper.abstract}`.toLowerCase();
  return RELEVANCE_TERMS.some(t => hay.includes(t));
}

function normalizeTitle(t) {
  return String(t).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
}

/* ── Category definitions ─────────────────────────────────── */
const CATEGORIES = [
  {
    id: 'codicological',
    name: 'Material and Codicological Studies',
    icon: '📜', color: 'var(--accent)',
    subcategories: [
      { id: 'paleography',  name: 'Paleography & Dating',
        query: '"cotton nero" paleography manuscript scribal hand dating' },
      { id: 'illuminations', name: 'Illuminations',
        query: '"cotton nero" illuminations miniatures paintings medieval' },
      { id: 'provenance',   name: 'Provenance & Geography',
        query: '"cotton nero" OR "pearl poet" provenance northwest midlands Cheshire' }
    ]
  },
  {
    id: 'authorship',
    name: 'Authorship Attribution & Computational Stylometry',
    icon: '⚗', color: 'var(--purple)',
    subcategories: [
      { id: 'biographical', name: 'Biographical Theories',
        query: '"pearl poet" OR "gawain poet" author identity biography' },
      { id: 'stylometry',   name: 'Computational Stylometry',
        query: '"pearl poet" OR "gawain poet" stylometry authorship attribution computational' }
    ]
  },
  {
    id: 'philology',
    name: 'Philology, Lexicography & Linguistic Poetics',
    icon: 'ᚠ', color: 'var(--green)',
    subcategories: [
      { id: 'dialectology', name: 'Dialectology',
        query: '"pearl poet" OR "cotton nero" dialectology middle english dialect northwest' },
      { id: 'semantic',     name: 'Semantic Domains',
        query: '"pearl poet" OR "pearl poem" lexicography semantic domains vocabulary' },
      { id: 'prosody',      name: 'Sound Symbolism & Prosody',
        query: '"pearl poet" OR "sir gawain green knight" alliterative prosody sound symbolism' }
    ]
  },
  {
    id: 'criticism',
    name: 'Thematic, Theological & Literary Criticism',
    icon: '✦', color: 'var(--gold)',
    subcategories: [
      { id: 'theology', name: 'Theology & Soteriology',
        query: '"pearl poem" OR "pearl poet" theology soteriology grace salvation' },
      { id: 'socio',    name: 'Socio-Historical Context',
        query: '"sir gawain green knight" OR "pearl poet" historical social context chivalry' },
      { id: 'allegory', name: 'Epistemology & Allegory',
        query: '"pearl poem" OR "pearl poet" allegory dream vision epistemology interpretation' }
    ]
  },
  {
    id: 'digital',
    name: 'Modern Reception, Translation & Digital Humanities',
    icon: '◈', color: 'var(--clean)',
    subcategories: [
      { id: 'translation',  name: 'Translation Theory',
        query: '"sir gawain green knight" OR "pearl poem" translation modern english reception' },
      { id: 'digitization', name: 'Digitization',
        query: '"cotton nero" OR "pearl manuscript" digital humanities digitization encoding' }
    ]
  }
];

/* ══════════════════════════════════════════════════════════
   SOURCE 1 — OpenAlex
   api.openalex.org · CORS ✓ · sorted by date ✓
   ══════════════════════════════════════════════════════════ */
async function fetchFromOpenAlex(query) {
  const params = new URLSearchParams({
    search:   `${query} ${ANCHOR}`,
    sort:     'publication_date:desc',
    per_page: '10',
    select:   'title,authorships,publication_year,primary_location,abstract_inverted_index,doi,open_access'
  });

  const res = await fetch(`https://api.openalex.org/works?${params}`,
    { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`OpenAlex ${res.status}`);

  const data = await res.json();
  return (data.results || []).map(w => ({
    title:   w.title || '',
    authors: (w.authorships || []).slice(0, 3)
               .map(a => a.author?.display_name).filter(Boolean).join(', '),
    year:    w.publication_year || 0,
    journal: w.primary_location?.source?.display_name || '',
    abstract: reconstructAbstract(w.abstract_inverted_index),
    url:     w.open_access?.oa_url
             || (w.doi ? `https://doi.org/${w.doi.replace('https://doi.org/', '')}` : '')
             || '',
    source: 'OpenAlex'
  }));
}

function reconstructAbstract(idx) {
  if (!idx || typeof idx !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(idx))
    for (const pos of positions) words[pos] = word;
  const text = words.filter(Boolean).join(' ');
  return text.length > 320 ? text.slice(0, 320) + '…' : text;
}

/* ══════════════════════════════════════════════════════════
   SOURCE 2 — Semantic Scholar
   api.semanticscholar.org · CORS ✓ · no key for basic use
   ══════════════════════════════════════════════════════════ */
async function fetchFromSemantic(query) {
  // Use a plain query (no ANCHOR boolean) — Semantic Scholar uses simple text search
  const params = new URLSearchParams({
    query:  query,
    fields: 'title,authors,year,abstract,venue,externalIds,openAccessPdf',
    limit:  '10'
  });

  const res = await fetch(
    `https://api.semanticscholar.org/graph/v1/paper/search?${params}`,
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) throw new Error(`Semantic Scholar ${res.status}`);

  const data = await res.json();
  return (data.data || []).map(p => {
    const doi = p.externalIds?.DOI || '';
    return {
      title:   p.title || '',
      authors: (p.authors || []).slice(0, 3).map(a => a.name).filter(Boolean).join(', '),
      year:    p.year || 0,
      journal: p.venue || '',
      abstract: p.abstract || '',
      url:     p.openAccessPdf?.url
               || (doi ? `https://doi.org/${doi}` : '')
               || '',
      source: 'Semantic Scholar'
    };
  });
}

/* ══════════════════════════════════════════════════════════
   SOURCE 3 — CrossRef
   api.crossref.org · CORS ✓ · no key needed
   ══════════════════════════════════════════════════════════ */
async function fetchFromCrossRef(query) {
  const params = new URLSearchParams({
    query:           query,
    sort:            'published',
    order:           'desc',
    rows:            '10',
    select:          'title,author,published,container-title,abstract,DOI',
    'filter':        'from-pub-date:1990'
  });

  const res = await fetch(`https://api.crossref.org/works?${params}`,
    { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`CrossRef ${res.status}`);

  const data = await res.json();
  return (data.message?.items || []).map(item => {
    const title   = Array.isArray(item.title) ? item.title[0] : (item.title || '');
    const journal = Array.isArray(item['container-title'])
                    ? item['container-title'][0]
                    : (item['container-title'] || '');
    const authors = (item.author || []).slice(0, 3)
                    .map(a => [a.given, a.family].filter(Boolean).join(' '))
                    .filter(Boolean).join(', ');
    const year    = item.published?.['date-parts']?.[0]?.[0] || 0;
    // CrossRef abstracts often contain JATS XML tags — strip them
    const abstract = (item.abstract || '').replace(/<[^>]+>/g, '').trim();
    const doi     = item.DOI || '';

    return {
      title, authors, year, journal,
      abstract: abstract.length > 320 ? abstract.slice(0, 320) + '…' : abstract,
      url:  doi ? `https://doi.org/${doi}` : '',
      source: 'CrossRef'
    };
  });
}

/* ══════════════════════════════════════════════════════════
   SOURCE 4 — Google Scholar (via /api/scholar Cloudflare Worker)
   Server-side scrape, sorted by date, 30-min server cache.
   Returns empty array gracefully if Scholar blocks the Worker.
   ══════════════════════════════════════════════════════════ */
async function fetchFromScholar(query) {
  const params = new URLSearchParams({ q: query, n: '10' });
  const res = await fetch(`/api/scholar?${params}`, {
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`Scholar worker HTTP ${res.status}`);

  const data = await res.json();

  // Worker returns either an array or { error, papers: [] }
  const items = Array.isArray(data) ? data : (data.papers || []);
  if (data.error && !items.length) {
    // Surface the error as a console warning but don't break other sources
    console.warn('Scholar:', data.error);
  }

  return items.map(p => ({ ...p, source: 'Google Scholar' }));
}

/* ══════════════════════════════════════════════════════════
   MERGE + DEDUPLICATE + FILTER + SORT
   ══════════════════════════════════════════════════════════ */
async function fetchPapers(query) {
  const settled = await Promise.allSettled([
    fetchFromOpenAlex(query),
    fetchFromSemantic(query),
    fetchFromCrossRef(query),
    fetchFromScholar(query)
  ]);

  const all = settled.flatMap(r =>
    r.status === 'fulfilled' ? r.value : []
  );

  // Deduplicate by normalised title
  const seen  = new Set();
  const unique = all.filter(p => {
    if (!p.title) return false;
    const key = normalizeTitle(p.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique
    .filter(isRelevant)
    .sort((a, b) => (b.year || 0) - (a.year || 0))
    .slice(0, 20);
}

/* ══════════════════════════════════════════════════════════
   STATE & DOM
   ══════════════════════════════════════════════════════════ */
const state = {};
const $ = id => document.getElementById(id);

function init() {
  renderCategoryPanels();
  bindRefreshAll();
}

/* ── Build panels ────────────────────────────────────────── */
function renderCategoryPanels() {
  const root = $('categories-root');
  root.innerHTML = '';

  CATEGORIES.forEach(cat => {
    state[cat.id] = { papers: {}, loadedAt: null, activeSubcat: cat.subcategories[0].id };

    const panel = document.createElement('div');
    panel.className = 'category-panel';
    panel.id = 'panel-' + cat.id;

    panel.innerHTML = `
      <div class="category-header" id="header-${cat.id}">
        <div class="category-accent" style="background:${cat.color}"></div>
        <div class="category-icon">${cat.icon}</div>
        <div class="category-info">
          <div class="category-name">${escHtml(cat.name)}</div>
          <div class="category-sub-names">${cat.subcategories.map(s => s.name).join(' · ')}</div>
        </div>
        <div class="category-actions">
          <span class="category-status" id="status-${cat.id}"></span>
          <button class="load-btn" id="load-btn-${cat.id}">Load research</button>
        </div>
        <span class="category-chevron">▾</span>
      </div>
      <div class="category-body" id="body-${cat.id}">
        <div class="subcategory-tabs" id="subtabs-${cat.id}">
          ${cat.subcategories.map((s, i) =>
            `<button class="subcat-tab${i === 0 ? ' active' : ''}"
               data-subcat="${s.id}" data-cat="${cat.id}">${s.name}</button>`
          ).join('')}
        </div>
        <div id="papers-area-${cat.id}">
          <div class="papers-empty">Click "Load research" to fetch live results from OpenAlex · Semantic Scholar · CrossRef · Google Scholar.</div>
        </div>
      </div>`;

    root.appendChild(panel);

    panel.querySelector('#header-' + cat.id).addEventListener('click', e => {
      if (e.target.closest('.load-btn')) return;
      togglePanel(cat.id);
    });
    panel.querySelector('#load-btn-' + cat.id).addEventListener('click', e => {
      e.stopPropagation();
      loadCategory(cat.id);
    });
    panel.querySelectorAll('.subcat-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        state[tab.dataset.cat].activeSubcat = tab.dataset.subcat;
        panel.querySelectorAll('.subcat-tab').forEach(t => t.classList.toggle('active', t === tab));
        renderPapersArea(tab.dataset.cat);
      });
    });
  });
}

function togglePanel(catId) {
  const open = $('header-' + catId).classList.toggle('open');
  $('body-'  + catId).classList.toggle('open', open);
  $('panel-' + catId).classList.toggle('open', open);
}
function openPanel(catId) {
  ['header-', 'body-', 'panel-'].forEach(p =>
    $(p + catId).classList.add('open'));
}

/* ── Load a category ─────────────────────────────────────── */
async function loadCategory(catId, forceRefresh = false) {
  const cat = CATEGORIES.find(c => c.id === catId);

  if (!forceRefresh) {
    const cached = loadFromCache(catId);
    if (cached) {
      state[catId].papers   = cached.papers;
      state[catId].loadedAt = cached.loadedAt;
      openPanel(catId);
      renderPapersArea(catId);
      updateStatus(catId, '✓ cached');
      return;
    }
  }

  openPanel(catId);
  const btn = $('load-btn-' + catId);
  btn.textContent = 'Loading…';
  btn.classList.add('loading');
  updateStatus(catId, '');

  $('papers-area-' + catId).innerHTML = `
    <div class="papers-loading">
      <span class="thinking-dots">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </span>
      Fetching from OpenAlex · Semantic Scholar · CrossRef · Google Scholar…
    </div>`;

  const results = {};
  await Promise.all(cat.subcategories.map(async subcat => {
    try   { results[subcat.id] = await fetchPapers(subcat.query); }
    catch (err) { results[subcat.id] = { error: err.message }; }
  }));

  state[catId].papers   = results;
  state[catId].loadedAt = Date.now();
  saveToCache(catId, { papers: results, loadedAt: state[catId].loadedAt });

  renderPapersArea(catId);
  updateStatus(catId, '✓ live');
  updateLastUpdatedBadge();
  btn.textContent = 'Refresh';
  btn.classList.remove('loading');
}

/* ── Render ──────────────────────────────────────────────── */
function renderPapersArea(catId) {
  const data = state[catId].papers[state[catId].activeSubcat];
  const area = $('papers-area-' + catId);
  if (!data)        { area.innerHTML = '<div class="papers-empty">No data loaded yet.</div>'; return; }
  if (data.error)   { area.innerHTML = `<div class="paper-error">⚠ ${escHtml(data.error)}</div>`; return; }
  if (!data.length) { area.innerHTML = '<div class="papers-empty">No results found — try a different subcategory.</div>'; return; }
  area.innerHTML = `<div class="papers-grid">${data.map(renderPaperCard).join('')}</div>`;
}

/* Source badge colours */
const SOURCE_COLORS = {
  'OpenAlex':         { bg: 'var(--accent-l)',   text: 'var(--accent)'  },
  'Semantic Scholar': { bg: 'var(--purple-l)',   text: 'var(--purple)'  },
  'CrossRef':         { bg: 'var(--green-l)',    text: 'var(--green)'   },
  'Google Scholar':   { bg: 'var(--patience-l)', text: 'var(--patience)'},
};

function renderPaperCard(paper) {
  const title   = escHtml(paper.title   || 'Untitled');
  const authors = escHtml(paper.authors || '');
  const year    = paper.year ? escHtml(String(paper.year)) : '';
  const journal = escHtml(paper.journal || '');
  const abstract= escHtml(paper.abstract|| '');
  const url     = paper.url || '';
  const src     = paper.source || '';
  const srcCol  = SOURCE_COLORS[src] || { bg: 'var(--surface-2)', text: 'var(--muted)' };

  return `
    <div class="paper-card">
      <div class="paper-tags">
        ${year ? `<span class="paper-tag year">${year}</span>` : ''}
        ${src  ? `<span class="paper-tag" style="background:${srcCol.bg};color:${srcCol.text};border-color:${srcCol.bg}">${src}</span>` : ''}
        ${journal ? `<span class="paper-tag">${journal.length > 36 ? journal.slice(0,36)+'…' : journal}</span>` : ''}
      </div>
      <div class="paper-title">
        ${url ? `<a href="${escHtml(url)}" target="_blank" rel="noopener">${title}</a>` : title}
      </div>
      ${authors  ? `<div class="paper-authors">${authors}</div>`   : ''}
      ${abstract ? `<div class="paper-abstract">${abstract}</div>` : ''}
      ${url      ? `<a class="paper-link" href="${escHtml(url)}" target="_blank" rel="noopener">View article ↗</a>` : ''}
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   CACHE
   ══════════════════════════════════════════════════════════ */
const cacheKey = id => `research_multi_${id}`;

function saveToCache(catId, data) {
  try { localStorage.setItem(cacheKey(catId), JSON.stringify({ ...data, savedAt: Date.now() })); } catch {}
}
function loadFromCache(catId) {
  try {
    const p = JSON.parse(localStorage.getItem(cacheKey(catId)) || 'null');
    return p && (Date.now() - p.savedAt < CACHE_TTL) ? p : null;
  } catch { return null; }
}
function clearCache(catId) {
  try { localStorage.removeItem(cacheKey(catId)); } catch {}
}

/* ── Status ──────────────────────────────────────────────── */
function updateStatus(catId, text) {
  const el = $('status-' + catId);
  if (el) { el.textContent = text; el.classList.toggle('loaded', text.startsWith('✓')); }
}
function updateLastUpdatedBadge() {
  const times = CATEGORIES.map(c => state[c.id]?.loadedAt).filter(Boolean);
  if (!times.length) return;
  const d = new Date(Math.max(...times));
  $('last-updated-badge').textContent =
    `Last updated: ${d.toLocaleDateString()} ${d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
}

/* ── Refresh all ─────────────────────────────────────────── */
function bindRefreshAll() {
  const btn = $('refresh-all-btn');
  btn.addEventListener('click', async () => {
    btn.classList.add('spinning'); btn.disabled = true;
    CATEGORIES.forEach(c => clearCache(c.id));
    const open = CATEGORIES.filter(c => $('body-' + c.id)?.classList.contains('open'));
    await Promise.all((open.length ? open : CATEGORIES).map(c => loadCategory(c.id, true)));
    btn.classList.remove('spinning'); btn.disabled = false;
  });
}

/* ── Utils ───────────────────────────────────────────────── */
function escHtml(t) {
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', init);