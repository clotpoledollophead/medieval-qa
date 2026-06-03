/* ══════════════════════════════════════════════════════════
   research.js — Live Research Dashboard
   Uses OpenAlex API (openalex.org) — free, no key needed,
   CORS-friendly, sorted publication_date:desc
   ══════════════════════════════════════════════════════════ */
'use strict';

const OPENALEX = 'https://api.openalex.org/works';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/* ── Category definitions ─────────────────────────────────── */
const CATEGORIES = [
  {
    id: 'codicological',
    name: 'Material and Codicological Studies',
    icon: '📜',
    color: 'var(--accent)',
    subcategories: [
      { id: 'paleography', name: 'Paleography & Dating',
        query: '"cotton nero" paleography manuscript scribal' },
      { id: 'illuminations', name: 'Illuminations',
        query: '"cotton nero" illuminations miniatures medieval artwork' },
      { id: 'provenance', name: 'Provenance & Geography',
        query: '"pearl poet" "cotton nero" provenance "northwest midlands"' }
    ]
  },
  {
    id: 'authorship',
    name: 'Authorship Attribution & Computational Stylometry',
    icon: '⚗',
    color: 'var(--purple)',
    subcategories: [
      { id: 'biographical', name: 'Biographical Theories',
        query: '"pearl poet" author identity biography attribution' },
      { id: 'stylometry', name: 'Computational Stylometry',
        query: '"pearl poet" OR "sir gawain" stylometry authorship computational' }
    ]
  },
  {
    id: 'philology',
    name: 'Philology, Lexicography & Linguistic Poetics',
    icon: 'ᚠ',
    color: 'var(--green)',
    subcategories: [
      { id: 'dialectology', name: 'Dialectology',
        query: '"pearl poet" OR "cotton nero" dialectology "middle english" dialect' },
      { id: 'semantic', name: 'Semantic Domains',
        query: '"pearl poet" lexicography semantic vocabulary "middle english"' },
      { id: 'prosody', name: 'Sound Symbolism & Prosody',
        query: '"pearl poet" OR "sir gawain" alliterative verse prosody phonetics' }
    ]
  },
  {
    id: 'criticism',
    name: 'Thematic, Theological & Literary Criticism',
    icon: '✦',
    color: 'var(--gold)',
    subcategories: [
      { id: 'theology', name: 'Theology & Soteriology',
        query: '"pearl poem" OR "sir gawain" theology grace soteriology salvation medieval' },
      { id: 'socio', name: 'Socio-Historical Context',
        query: '"sir gawain" OR "pearl poet" historical context chivalry fourteenth century' },
      { id: 'allegory', name: 'Epistemology & Allegory',
        query: '"pearl poem" allegory "dream vision" epistemology medieval' }
    ]
  },
  {
    id: 'digital',
    name: 'Modern Reception, Translation & Digital Humanities',
    icon: '◈',
    color: 'var(--clean)',
    subcategories: [
      { id: 'translation', name: 'Translation Theory',
        query: '"sir gawain green knight" OR "pearl poem" translation modern english theory' },
      { id: 'digitization', name: 'Digitization',
        query: '"cotton nero" OR "pearl manuscript" digital humanities digitization TEI' }
    ]
  }
];

/* ── State ─────────────────────────────────────────────────── */
const state = {};
const $ = id => document.getElementById(id);

/* ══════════════════════════════════════════════════════════
   OPENALEX FETCH
   ══════════════════════════════════════════════════════════ */
async function fetchPapers(query) {
  const params = new URLSearchParams({
    search:   query,
    sort:     'publication_date:desc',
    per_page: '8',
    select:   'title,authorships,publication_year,primary_location,abstract_inverted_index,doi,open_access,type'
  });

  const res = await fetch(`${OPENALEX}?${params}`, {
    headers: { 'Accept': 'application/json' }
  });

  if (!res.ok) throw new Error(`OpenAlex ${res.status}: ${res.statusText}`);

  const data = await res.json();

  return (data.results || []).map(work => ({
    title:    work.title || 'Untitled',
    authors:  (work.authorships || [])
                .slice(0, 3)
                .map(a => a.author?.display_name)
                .filter(Boolean)
                .join(', '),
    year:     work.publication_year || 0,
    journal:  work.primary_location?.source?.display_name || '',
    abstract: reconstructAbstract(work.abstract_inverted_index),
    url:      work.open_access?.oa_url
              || (work.doi ? `https://doi.org/${work.doi.replace('https://doi.org/', '')}` : '')
              || work.primary_location?.landing_page_url
              || ''
  }));
}

/* Reconstruct OpenAlex inverted-index abstract */
function reconstructAbstract(idx) {
  if (!idx || typeof idx !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(idx)) {
    for (const pos of positions) words[pos] = word;
  }
  const joined = words.filter(Boolean).join(' ');
  return joined.length > 320 ? joined.slice(0, 320) + '…' : joined;
}

/* ══════════════════════════════════════════════════════════
   INIT & PANELS
   ══════════════════════════════════════════════════════════ */
function init() {
  renderCategoryPanels();
  bindRefreshAll();
}

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
          <div class="papers-empty">Click "Load research" to fetch live results from OpenAlex.</div>
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
  $('body-'   + catId).classList.toggle('open', open);
  $('panel-'  + catId).classList.toggle('open', open);
}

function openPanel(catId) {
  $('header-' + catId).classList.add('open');
  $('body-'   + catId).classList.add('open');
  $('panel-'  + catId).classList.add('open');
}

/* ══════════════════════════════════════════════════════════
   LOAD A CATEGORY
   ══════════════════════════════════════════════════════════ */
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
      Fetching from OpenAlex…
    </div>`;

  const results = {};
  await Promise.all(cat.subcategories.map(async subcat => {
    try {
      results[subcat.id] = await fetchPapers(subcat.query);
    } catch (err) {
      results[subcat.id] = { error: err.message };
    }
  }));

  state[catId].papers   = results;
  state[catId].loadedAt = Date.now();
  saveToCache(catId, { papers: results, loadedAt: state[catId].loadedAt });

  renderPapersArea(catId);
  updateStatus(catId, `✓ ${Date.now() - state[catId].loadedAt < 500 ? 'live' : 'live'}`);
  updateLastUpdatedBadge();

  btn.textContent = 'Refresh';
  btn.classList.remove('loading');
}

/* ══════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════ */
function renderPapersArea(catId) {
  const data = state[catId].papers[state[catId].activeSubcat];
  const area = $('papers-area-' + catId);

  if (!data) {
    area.innerHTML = '<div class="papers-empty">No data loaded yet.</div>';
    return;
  }
  if (data.error) {
    area.innerHTML = `<div class="paper-error">⚠ ${escHtml(data.error)}</div>`;
    return;
  }
  if (!data.length) {
    area.innerHTML = '<div class="papers-empty">No results found — try a different subcategory.</div>';
    return;
  }
  area.innerHTML = `<div class="papers-grid">${data.map(renderPaperCard).join('')}</div>`;
}

function renderPaperCard(paper) {
  const title   = escHtml(paper.title   || 'Untitled');
  const authors = escHtml(paper.authors || '');
  const year    = paper.year ? escHtml(String(paper.year)) : '';
  const journal = escHtml(paper.journal || '');
  const abstract= escHtml(paper.abstract|| '');
  const url     = paper.url || '';

  return `
    <div class="paper-card">
      <div class="paper-tags">
        ${year    ? `<span class="paper-tag year">${year}</span>` : ''}
        ${journal ? `<span class="paper-tag">${journal.length > 40 ? journal.slice(0,40)+'…' : journal}</span>` : ''}
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
const cacheKey = id => `openalex_cache_${id}`;

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

/* ── Status helpers ─────────────────────────────────────────── */
function updateStatus(catId, text) {
  const el = $('status-' + catId);
  if (el) { el.textContent = text; el.classList.toggle('loaded', text.startsWith('✓')); }
}

function updateLastUpdatedBadge() {
  const times = CATEGORIES.map(c => state[c.id]?.loadedAt).filter(Boolean);
  if (!times.length) return;
  const d = new Date(Math.max(...times));
  $('last-updated-badge').textContent =
    `Last updated: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
}

/* ── Refresh all ─────────────────────────────────────────────── */
function bindRefreshAll() {
  const btn = $('refresh-all-btn');
  btn.addEventListener('click', async () => {
    btn.classList.add('spinning');
    btn.disabled = true;
    CATEGORIES.forEach(c => clearCache(c.id));
    const open = CATEGORIES.filter(c => $('body-' + c.id)?.classList.contains('open'));
    await Promise.all((open.length ? open : CATEGORIES).map(c => loadCategory(c.id, true)));
    btn.classList.remove('spinning');
    btn.disabled = false;
  });
}

/* ── Utils ──────────────────────────────────────────────────── */
function escHtml(t) {
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', init);