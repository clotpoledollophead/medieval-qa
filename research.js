/* ══════════════════════════════════════════════════════════
   research.js — Live Research Dashboard
   Uses the same /api/ask worker as the Q&A tool (Gemini)
   ══════════════════════════════════════════════════════════ */
'use strict';

const WORKER_URL  = '/api/ask';
const CACHE_TTL   = 24 * 60 * 60 * 1000; // 24 hours

/* ── Category definitions ─────────────────────────────────── */
const CATEGORIES = [
  {
    id: 'codicological',
    name: 'Material and Codicological Studies',
    icon: '📜',
    color: 'var(--accent)',
    subcategories: [
      {
        id: 'paleography',
        name: 'Paleography & Dating',
        query: 'recent scholarship on Cotton Nero A.x manuscript paleography, scribal hand, and dating'
      },
      {
        id: 'illuminations',
        name: 'Illuminations',
        query: 'scholarship on the illuminations and miniature paintings in Cotton Nero A.x'
      },
      {
        id: 'provenance',
        name: 'Provenance & Geography',
        query: 'scholarship on the provenance and Northwest Midlands origin of Cotton Nero A.x'
      }
    ]
  },
  {
    id: 'authorship',
    name: 'Authorship Attribution & Computational Stylometry',
    icon: '⚗',
    color: 'var(--purple)',
    subcategories: [
      {
        id: 'biographical',
        name: 'Biographical Theories',
        query: 'biographical theories and proposed identities for the Pearl-poet author'
      },
      {
        id: 'stylometry',
        name: 'Computational Stylometry',
        query: 'computational stylometry and authorship attribution studies of the Pearl-poet poems'
      }
    ]
  },
  {
    id: 'philology',
    name: 'Philology, Lexicography & Linguistic Poetics',
    icon: 'ᚠ',
    color: 'var(--green)',
    subcategories: [
      {
        id: 'dialectology',
        name: 'Dialectology',
        query: 'dialectology and linguistic geography of the Pearl-poet Middle English dialect'
      },
      {
        id: 'semantic',
        name: 'Semantic Domains',
        query: 'lexicography and semantic domain studies of Pearl-poet vocabulary and theological language'
      },
      {
        id: 'prosody',
        name: 'Sound Symbolism & Prosody',
        query: 'alliterative verse prosody, sound symbolism, and phonetics in Pearl and Sir Gawain'
      }
    ]
  },
  {
    id: 'criticism',
    name: 'Thematic, Theological & Literary Criticism',
    icon: '✦',
    color: 'var(--gold)',
    subcategories: [
      {
        id: 'theology',
        name: 'Theology & Soteriology',
        query: 'theological criticism, soteriology, and grace in Pearl, Sir Gawain, Patience, and Cleanness'
      },
      {
        id: 'socio',
        name: 'Socio-Historical Context',
        query: 'socio-historical context, chivalry, and fourteenth-century English society in the Pearl-poet poems'
      },
      {
        id: 'allegory',
        name: 'Epistemology & Allegory',
        query: 'allegory, dream vision, and epistemology in Pearl and Cleanness'
      }
    ]
  },
  {
    id: 'digital',
    name: 'Modern Reception, Translation & Digital Humanities',
    icon: '◈',
    color: 'var(--clean)',
    subcategories: [
      {
        id: 'translation',
        name: 'Translation Theory',
        query: 'translation theory and practice of Sir Gawain and the Green Knight and Pearl into Modern English'
      },
      {
        id: 'digitization',
        name: 'Digitization',
        query: 'digital humanities, manuscript digitization, and TEI encoding of Cotton Nero A.x'
      }
    ]
  }
];

/* ── System prompt ─────────────────────────────────────────── */
const RESEARCH_SYSTEM =
  `You are a bibliographer and research specialist in medieval Middle English literature, ` +
  `focusing on the Pearl-poet and MS Cotton Nero A.x. ` +
  `When asked for a list of scholarly articles or books on a topic, ` +
  `respond ONLY with a valid JSON array (no preamble, no markdown fences, no commentary). ` +
  `Each element must be an object with these exact keys: ` +
  `"title" (string), "authors" (string), "year" (number), "journal" (string), ` +
  `"abstract" (string — 1–2 sentences summarising the argument), "url" (string — DOI or publisher link if known, else ""). ` +
  `Return up to 7 items. If year or url are unknown, use 0 and "" respectively. ` +
  `Return only the JSON array.`;

/* ── State ─────────────────────────────────────────────────── */
const state = {};

/* ── DOM helper ─────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ══════════════════════════════════════════════════════════
   SHARED WORKER HELPER
   (same request/response format as app.js)
   ══════════════════════════════════════════════════════════ */
async function callWorker(systemPrompt, userMessage, maxTokens = 1200) {
  const res = await fetch(WORKER_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    })
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText  = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    for (const line of decoder.decode(value).split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (!json || json === '[DONE]') continue;
      try {
        const chunk = JSON.parse(json);
        if (chunk.error) throw new Error(chunk.error.message || JSON.stringify(chunk.error));
        fullText += chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch (e) { throw e; }
    }
  }

  return fullText;
}

/* ══════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════ */
function init() {
  renderCategoryPanels();
  bindRefreshAll();
}

/* ── Build all category panels ──────────────────────────────── */
function renderCategoryPanels() {
  const root = $('categories-root');
  root.innerHTML = '';

  CATEGORIES.forEach(cat => {
    state[cat.id] = {
      papers:      {},
      loadedAt:    null,
      activeSubcat: cat.subcategories[0].id
    };

    const panel = document.createElement('div');
    panel.className = 'category-panel';
    panel.id = 'panel-' + cat.id;

    panel.innerHTML = `
      <div class="category-header" id="header-${cat.id}">
        <div class="category-accent" style="background:${cat.color};"></div>
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
            `<button class="subcat-tab${i === 0 ? ' active' : ''}" data-subcat="${s.id}" data-cat="${cat.id}">${s.name}</button>`
          ).join('')}
        </div>
        <div id="papers-area-${cat.id}">
          <div class="papers-empty">Click "Load research" to fetch scholarship from Gemini.</div>
        </div>
      </div>`;

    root.appendChild(panel);

    panel.querySelector(`#header-${cat.id}`).addEventListener('click', e => {
      if (e.target.closest('.load-btn')) return;
      togglePanel(cat.id);
    });

    panel.querySelector(`#load-btn-${cat.id}`).addEventListener('click', e => {
      e.stopPropagation();
      loadCategory(cat.id);
    });

    panel.querySelectorAll('.subcat-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const catId    = tab.dataset.cat;
        const subcatId = tab.dataset.subcat;
        state[catId].activeSubcat = subcatId;
        panel.querySelectorAll('.subcat-tab').forEach(t => t.classList.toggle('active', t === tab));
        renderPapersArea(catId);
      });
    });
  });
}

function togglePanel(catId) {
  const header = $('header-' + catId);
  const body   = $('body-'   + catId);
  const isOpen = header.classList.contains('open');
  header.classList.toggle('open',  !isOpen);
  body.classList.toggle('open',    !isOpen);
  $('panel-' + catId).classList.toggle('open', !isOpen);
}

function openPanel(catId) {
  $('header-' + catId).classList.add('open');
  $('body-'   + catId).classList.add('open');
  $('panel-'  + catId).classList.add('open');
}

/* ══════════════════════════════════════════════════════════
   FETCH
   ══════════════════════════════════════════════════════════ */
async function loadCategory(catId, forceRefresh = false) {
  const cat = CATEGORIES.find(c => c.id === catId);

  // Check cache
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

  const loadBtn = $('load-btn-' + catId);
  loadBtn.textContent = 'Loading…';
  loadBtn.classList.add('loading');
  updateStatus(catId, '');

  $('papers-area-' + catId).innerHTML = `
    <div class="papers-loading">
      <span class="thinking-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>
      Consulting the model…
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
  updateStatus(catId, '✓ loaded');
  updateLastUpdatedBadge();

  loadBtn.textContent = 'Refresh';
  loadBtn.classList.remove('loading');
}

async function fetchPapers(query) {
  const userMessage =
    `List notable and recent scholarly works (books, journal articles, book chapters) about: ` +
    `"${query}" in relation to the Pearl-poet poems (Pearl, Sir Gawain and the Green Knight, ` +
    `Patience, Cleanness) or MS Cotton Nero A.x. ` +
    `Return up to 7 items as a JSON array only.`;

  const raw = await callWorker(RESEARCH_SYSTEM, userMessage, 1200);

  // Strip markdown fences if present
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  const start = cleaned.indexOf('[');
  const end   = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) return [];

  try {
    const papers = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(papers) ? papers : [];
  } catch {
    return [];
  }
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
    area.innerHTML = '<div class="papers-empty">No results returned for this subcategory.</div>';
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

  const titleHtml = url
    ? `<a href="${escHtml(url)}" target="_blank" rel="noopener">${title}</a>`
    : title;

  return `
    <div class="paper-card">
      <div class="paper-tags">
        ${year    ? `<span class="paper-tag year">${year}</span>` : ''}
        ${journal ? `<span class="paper-tag">${journal.slice(0,40)}${journal.length>40?'…':''}</span>` : ''}
      </div>
      <div class="paper-title">${titleHtml}</div>
      ${authors  ? `<div class="paper-authors">${authors}</div>`   : ''}
      ${abstract ? `<div class="paper-abstract">${abstract}</div>` : ''}
      ${url      ? `<a class="paper-link" href="${escHtml(url)}" target="_blank" rel="noopener">View article ↗</a>` : ''}
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   CACHE (localStorage, 24 h TTL)
   ══════════════════════════════════════════════════════════ */
const cacheKey = id => `research_cache_${id}`;

function saveToCache(catId, data) {
  try { localStorage.setItem(cacheKey(catId), JSON.stringify({ ...data, savedAt: Date.now() })); } catch {}
}
function loadFromCache(catId) {
  try {
    const raw = localStorage.getItem(cacheKey(catId));
    if (!raw) return null;
    const p = JSON.parse(raw);
    return (Date.now() - p.savedAt > CACHE_TTL) ? null : p;
  } catch { return null; }
}
function clearCache(catId) {
  try { localStorage.removeItem(cacheKey(catId)); } catch {}
}

/* ── Status ─────────────────────────────────────────────────── */
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
    const openCats = CATEGORIES.filter(c => $('body-' + c.id)?.classList.contains('open'));
    const toLoad   = openCats.length ? openCats : CATEGORIES;
    await Promise.all(toLoad.map(c => loadCategory(c.id, true)));
    btn.classList.remove('spinning');
    btn.disabled = false;
    updateLastUpdatedBadge();
  });
}

/* ── Utils ──────────────────────────────────────────────────── */
function escHtml(t) {
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', init);
