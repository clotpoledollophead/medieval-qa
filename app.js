/* ══════════════════════════════════════════════════════════
   Pearl & Sir Gawain — Scholarly Q&A
   app.js  ·  Requires style.css + index.html
   ══════════════════════════════════════════════════════════ */

const WORKER_URL = '/api/ask';

/* ── Chart colours (matches CSS vars) ────────────────────── */
const CHART_COLORS = [
  { bg: 'rgba(124,94,60,0.75)',  border: '#7c5e3c' },
  { bg: 'rgba(74,53,112,0.75)',  border: '#4a3570' },
  { bg: 'rgba(45,90,61,0.75)',   border: '#2d5a3d' },
  { bg: 'rgba(139,48,32,0.75)',  border: '#8b3020' },
  { bg: 'rgba(26,84,128,0.75)',  border: '#1a5480' },
];

/* ── System prompts ───────────────────────────────────────── */
const BASE_SYSTEM =
  `You are a scholarly assistant specialising in the works of the Pearl-poet ` +
  `(the anonymous 14th-century author of Pearl, Sir Gawain and the Green Knight, ` +
  `Patience, and Cleanness). Answer questions accurately and helpfully. ` +
  `When quoting Middle English passages, include a brief Modern English translation ` +
  `in parentheses. Keep answers clear and concise (at most 3–5 sentences) but avoid padding or preamble. ` +
  `Cite specific lines or scholarly sources for all claims, and provide line numbers for any quotations.\n\n` +
  `FORMATTING RULES:\n` +
  `- Use Markdown tables (| col | col | syntax) whenever presenting comparative or structured data.\n` +
  `- When a question calls for quantitative or distributional data that would genuinely benefit from a chart, ` +
  `output a fenced code block labelled \`\`\`chart containing only a JSON object with these fields: ` +
  `{"type":"bar"|"line"|"pie","title":"...","labels":[...],"datasets":[{"label":"...","data":[...]}]}. ` +
  `Use charts sparingly — only when a visual genuinely aids understanding.`;

const SCOPE_CONTEXT = {
  all:       'You may draw on all four Pearl-poet poems: Pearl, Sir Gawain and the Green Knight, Patience, and Cleanness.',
  pearl:     'Focus your answer only on the poem Pearl.',
  sggk:      'Focus your answer only on Sir Gawain and the Green Knight.',
  patience:  "Focus your answer only on the poem Patience, the Pearl-poet's retelling of the Book of Jonah.",
  cleanness: "Focus your answer only on Cleanness (also called Purity), the Pearl-poet's meditation on moral purity through biblical narratives.",
};

const PILL_LABELS = {
  all: 'All poems', pearl: 'Pearl', sggk: 'Sir Gawain',
  patience: 'Patience', cleanness: 'Cleanness',
};

const POEM_NAMES = {
  all:       'Pearl and Sir Gawain and the Green Knight',
  pearl:     'Pearl',
  sggk:      'Sir Gawain and the Green Knight',
  patience:  'Patience',
  cleanness: 'Cleanness',
};

const MAX_CHARS = 600;

/* ── State ────────────────────────────────────────────────── */
let scope    = 'all';
let history  = [];
let messages = [];
let view     = 'chat';
let loading  = false;
let msgId    = 0;

/* ── DOM refs ─────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const messagesEl   = $('messages');
const bookmarkList = $('bookmarks-list');
const questionEl   = $('question');
const sendBtn      = $('send-btn');
const charCount    = $('char-count');
const statusText   = $('status-text');
const bookmarkCnt  = $('bookmark-count');
const chatView     = $('chat-view');
const bookmarkView = $('bookmarks-view');

/* ══════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════ */
function init() {
  loadPreferences();
  bindTabs();
  bindSuggestions();
  bindInput();
  bindToolbar();
  bindCitationBar();
  bindFootnoteModal();
}

/* ── Preferences ──────────────────────────────────────────── */
function loadPreferences() {
  const dark = localStorage.getItem('darkMode') === 'true';
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');

  const fs = localStorage.getItem('fontSize') || 'md';
  document.body.classList.add('fs-' + fs);

  const saved = JSON.parse(localStorage.getItem('bookmarks') || '[]');
  saved.forEach(m => { m.bookmarked = true; messages.push(m); });
  updateBookmarkBadge();
}

function saveBookmarks() {
  localStorage.setItem('bookmarks', JSON.stringify(messages.filter(m => m.bookmarked)));
}

/* ══════════════════════════════════════════════════════════
   TABS
   ══════════════════════════════════════════════════════════ */
function bindTabs() {
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      scope = tab.dataset.scope;
    });
  });
}

/* ══════════════════════════════════════════════════════════
   SUGGESTIONS
   ══════════════════════════════════════════════════════════ */
function bindSuggestions() {
  $$('.sug').forEach(btn => {
    btn.addEventListener('click', () => {
      const sc = btn.dataset.scope;
      if (sc) {
        $$('.tab').forEach(t => t.classList.remove('active'));
        const tab = document.querySelector(`.tab[data-scope="${sc}"]`);
        if (tab) { tab.classList.add('active'); scope = sc; }
      }
      ask(btn.textContent.trim());
    });
  });
}

/* ══════════════════════════════════════════════════════════
   INPUT
   ══════════════════════════════════════════════════════════ */
function bindInput() {
  questionEl.addEventListener('input', () => { autoResize(questionEl); updateCharCounter(); });
  questionEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
  });
  sendBtn.addEventListener('click', () => ask());
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function updateCharCounter() {
  const len = questionEl.value.length;
  charCount.textContent = `${len} / ${MAX_CHARS}`;
  charCount.classList.toggle('over', len > MAX_CHARS);
  sendBtn.disabled = len === 0 || len > MAX_CHARS || loading;
}

function setStatus(text) { statusText.textContent = text; }

/* ══════════════════════════════════════════════════════════
   ASK  /  GEMINI via CLOUDFLARE PAGES FUNCTION
   ══════════════════════════════════════════════════════════ */
async function ask(question) {
  const q = (question ?? questionEl.value).trim();
  if (!q || loading) return;

  questionEl.value = '';
  autoResize(questionEl);
  updateCharCounter();
  setLoading(true);
  setStatus('Consulting the texts…');

  addMessage('user', q);
  history.push({ role: 'user', parts: [{ text: q }] });

  const thinkId = showThinking();
  const systemPrompt = `${BASE_SYSTEM}\n\n${SCOPE_CONTEXT[scope]}`;

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(WORKER_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      signal:  controller.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: history,
        generationConfig: { maxOutputTokens: 1200 },
      }),
    });

    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    hideThinking(thinkId);
    const assistantMsg = addMessage('assistant', '', scope);
    let fullText = '';

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      for (const line of decoder.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (!json || json === '[DONE]') continue;
        try {
          const chunk = JSON.parse(json);
          if (chunk.error) throw new Error(chunk.error.message);
          fullText += chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
          assistantMsg.text = fullText;
          const bubble = messagesEl.querySelector(`[data-id="${assistantMsg.id}"] .msg-content`);
          if (bubble) bubble.innerHTML = renderText(fullText, true);
          scrollBottom();
        } catch (e) { throw e; }
      }
    }

    // Render any charts now that the full response is in
    const msgEl = messagesEl.querySelector(`[data-id="${assistantMsg.id}"]`);
    if (msgEl) renderCharts(msgEl);

    history.push({ role: 'model', parts: [{ text: fullText }] });
    setStatus('');

  } catch (err) {
    clearTimeout(timeout);
    hideThinking(thinkId);
    const label = err.name === 'AbortError' ? 'Request timed out after 30 seconds.' : err.message;
    addMessage('assistant', formatError(label), scope, true);
    history.pop();
    setStatus('');
  }

  setLoading(false);
  scrollBottom();
}

function formatError(msg) {
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError'))
    return '⚠ Could not reach the server. Check that the Pages Function is deployed correctly.';
  if (msg.includes('404'))
    return '⚠ Function not found (404). Make sure functions/api/ask.js is at the repo root.';
  return `⚠ Error: ${msg}`;
}

function setLoading(on) {
  loading = on;
  sendBtn.disabled = on;
}

/* ══════════════════════════════════════════════════════════
   CHART RENDERING
   ══════════════════════════════════════════════════════════ */
let chartCounter = 0;

function renderCharts(container) {
  const isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#f0e8dc' : '#261a10';
  const gridColor = isDark ? '#3d3028' : '#e2d9cc';

  container.querySelectorAll('code.language-chart, code.language-json').forEach(codeEl => {
    try {
      const data   = JSON.parse(codeEl.textContent);
      const pre    = codeEl.closest('pre');
      const canvasId = 'chart-' + chartCounter++;

      const wrapper = document.createElement('div');
      wrapper.className = 'chart-wrapper';

      const titleEl = document.createElement('div');
      titleEl.className = 'chart-title';
      titleEl.textContent = data.title || '';
      if (data.title) wrapper.appendChild(titleEl);

      const canvas = document.createElement('canvas');
      canvas.id = canvasId;
      wrapper.appendChild(canvas);

      pre.replaceWith(wrapper);

      const isPie = data.type === 'pie' || data.type === 'doughnut';

      new Chart(canvas, {
        type: data.type || 'bar',
        data: {
          labels: data.labels || [],
          datasets: (data.datasets || []).map((ds, i) => ({
            label:           ds.label,
            data:            ds.data,
            backgroundColor: isPie
              ? CHART_COLORS.map(c => c.bg)
              : CHART_COLORS[i % CHART_COLORS.length].bg,
            borderColor: isPie
              ? CHART_COLORS.map(c => c.border)
              : CHART_COLORS[i % CHART_COLORS.length].border,
            borderWidth: 1.5,
            tension: 0.35,
          })),
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              display: true,
              labels: { color: textColor, font: { family: 'EB Garamond, Georgia, serif', size: 13 } },
            },
          },
          scales: isPie ? {} : {
            x: { ticks: { color: textColor }, grid: { color: gridColor } },
            y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true },
          },
        },
      });
    } catch (e) {
      console.warn('Chart render failed:', e);
    }
  });
}

/* ══════════════════════════════════════════════════════════
   MESSAGE MANAGEMENT
   ══════════════════════════════════════════════════════════ */
function addMessage(role, text, sc, failed = false) {
  const msg = { id: msgId++, role, text, scope: sc, bookmarked: false, ts: Date.now(), failed };
  messages.push(msg);
  renderMessage(msg, messagesEl);
  scrollBottom();
  return msg;
}

function renderMessage(msg, container) {
  const empty = container.querySelector('.empty');
  if (empty) empty.remove();

  const isUser = msg.role === 'user';
  const time   = new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const div = document.createElement('div');
  div.className = `msg ${msg.role}${msg.failed ? ' failed' : ''}`;
  div.dataset.id = msg.id;

  div.innerHTML = `
    <div class="msg-label">
      ${isUser ? 'You' : 'Scholar'}
      <span class="msg-time">${time}</span>
    </div>
    <div class="msg-bubble">
      <div class="msg-content">${renderText(msg.text, !isUser)}</div>
      ${!isUser ? `<div><span class="pill pill-${msg.scope}">${PILL_LABELS[msg.scope] || ''}</span></div>` : ''}
    </div>
    <div class="msg-actions">
      ${!isUser ? `<button class="action-btn copy-btn"     data-id="${msg.id}" title="Copy answer">⎘ Copy</button>` : ''}
      ${!isUser ? `<button class="action-btn fn-btn"       data-id="${msg.id}" title="Generate footnotes">¶ Footnote</button>` : ''}
      ${!isUser ? `<button class="action-btn bk-btn${msg.bookmarked ? ' bookmarked' : ''}" data-id="${msg.id}">
        ${msg.bookmarked ? '★ Saved' : '☆ Save'}
      </button>` : ''}
      ${msg.failed ? `<button class="action-btn retry-btn" data-id="${msg.id}" title="Retry">↺ Retry</button>` : ''}
    </div>`;

  const copyBtn  = div.querySelector('.copy-btn');
  const fnBtn    = div.querySelector('.fn-btn');
  const bkBtn    = div.querySelector('.bk-btn');
  const retryBtn = div.querySelector('.retry-btn');

  if (copyBtn)  copyBtn.addEventListener('click',  () => copyMessage(msg.id, copyBtn));
  if (fnBtn)    fnBtn.addEventListener('click',    () => openFootnoteModal(msg.id));
  if (bkBtn)    bkBtn.addEventListener('click',    () => toggleBookmark(msg.id));
  if (retryBtn) retryBtn.addEventListener('click', () => retryMessage(msg.id));

  container.appendChild(div);
}

function renderAllMessages(container, list) {
  container.innerHTML = '';
  if (!list.length) {
    container.innerHTML = '<div class="empty">No saved answers yet. Click ☆ on any response to save it here.</div>';
    return;
  }
  list.forEach(m => renderMessage(m, container));
}

function escHtml(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderText(text, isAssistant) {
  if (!isAssistant) return escHtml(text).replace(/\n/g, '<br>');
  return marked.parse(text);
}

function scrollBottom() {
  const target = view === 'chat' ? messagesEl : bookmarkList;
  target.scrollTop = target.scrollHeight;
}

/* ── Thinking bubble ──────────────────────────────────────── */
let thinkCounter = 0;
function showThinking() {
  const id  = 'think-' + thinkCounter++;
  const div = document.createElement('div');
  div.className = 'msg assistant';
  div.id = id;
  div.innerHTML = `<div class="msg-label">Scholar</div>
    <div class="msg-bubble" style="color:var(--muted);font-style:italic">
      Reading the texts<span class="thinking-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>
    </div>`;
  messagesEl.appendChild(div);
  scrollBottom();
  return id;
}
function hideThinking(id) { const el = $(id); if (el) el.remove(); }

/* ══════════════════════════════════════════════════════════
   MESSAGE ACTIONS
   ══════════════════════════════════════════════════════════ */
async function copyMessage(id, btn) {
  const msg = messages.find(m => m.id === id);
  if (!msg) return;
  try {
    await navigator.clipboard.writeText(msg.text);
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '⎘ Copy'; btn.classList.remove('copied'); }, 2000);
  } catch { prompt('Copy this text:', msg.text); }
}

function toggleBookmark(id) {
  const msg = messages.find(m => m.id === id);
  if (!msg) return;
  msg.bookmarked = !msg.bookmarked;

  const btn = messagesEl.querySelector(`.bk-btn[data-id="${id}"]`);
  if (btn) {
    btn.textContent = msg.bookmarked ? '★ Saved' : '☆ Save';
    btn.classList.toggle('bookmarked', msg.bookmarked);
  }

  updateBookmarkBadge();
  saveBookmarks();
  if (view === 'bookmarks') renderAllMessages(bookmarkList, messages.filter(m => m.bookmarked));
}

function updateBookmarkBadge() {
  const count = messages.filter(m => m.bookmarked).length;
  bookmarkCnt.textContent = count;
  bookmarkCnt.classList.toggle('hidden', count === 0);
}

function retryMessage(id) {
  const failedMsg = messages.find(m => m.id === id);
  if (!failedMsg) return;
  const idx     = messages.indexOf(failedMsg);
  const userMsg = messages.slice(0, idx).reverse().find(m => m.role === 'user');
  if (!userMsg) return;
  messages.splice(idx, 1);
  const el = messagesEl.querySelector(`[data-id="${id}"]`);
  if (el) el.remove();
  ask(userMsg.text);
}

/* ══════════════════════════════════════════════════════════
   FOOTNOTE MODAL
   ══════════════════════════════════════════════════════════ */
const footnoteModal = $('footnote-modal');
const modalBody     = $('modal-body');
const modalCopy     = $('modal-copy');
let   modalText     = '';

function bindFootnoteModal() {
  $('modal-close').addEventListener('click', closeFootnoteModal);
  footnoteModal.addEventListener('click', e => { if (e.target === footnoteModal) closeFootnoteModal(); });
  modalCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(modalText).catch(() => prompt('Copy:', modalText));
    modalCopy.textContent = '✓ Copied';
    setTimeout(() => { modalCopy.textContent = '⎘ Copy all'; }, 2000);
  });
}

function openFootnoteModal(msgId) {
  const msg = messages.find(m => m.id === msgId);
  if (!msg) return;

  modalText = '';
  modalBody.innerHTML = `<div class="modal-loading">Generating footnotes<span class="thinking-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span></div>`;
  footnoteModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  streamFootnote(msg.text);
}

function closeFootnoteModal() {
  footnoteModal.classList.add('hidden');
  document.body.style.overflow = '';
}

async function streamFootnote(answerText) {
  const prompt =
    `Below is a scholarly answer about the Pearl-poet's works. ` +
    `Reformat its key claims and citations as ready-to-use footnotes in all four academic styles: ` +
    `MLA, Chicago (notes-bibliography), APA, and MHRA. ` +
    `Present each style under a clear heading. Where line numbers are cited, retain them. ` +
    `Use the standard edition: Andrew, Malcolm, and Ronald Waldron, eds. ` +
    `*The Poems of the Pearl Manuscript*. University of Exeter Press, 2007.\n\n` +
    `ANSWER:\n${answerText}`;

  try {
    const res = await fetch(WORKER_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: BASE_SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 900 },
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   full    = '';
    let   started = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (!json || json === '[DONE]') continue;
        try {
          const chunk = JSON.parse(json);
          full += chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
          modalText = full;
          if (!started) { modalBody.innerHTML = '<div class="modal-content"></div>'; started = true; }
          modalBody.querySelector('.modal-content').innerHTML = marked.parse(full);
        } catch {}
      }
    }
  } catch (err) {
    modalBody.innerHTML = `<p style="color:var(--danger)">⚠ Error: ${escHtml(err.message)}</p>`;
  }
}

/* ══════════════════════════════════════════════════════════
   TOOLBAR
   ══════════════════════════════════════════════════════════ */
function bindToolbar() {
  $('dark-btn').addEventListener('click', toggleDark);
  $('font-btn').addEventListener('click', cycleFontSize);
  $('clear-btn').addEventListener('click', clearChat);
  $('export-btn').addEventListener('click', exportChat);
  $('bookmark-view-btn').addEventListener('click', showBookmarksView);
  $('back-btn').addEventListener('click', showChatView);
}

function toggleDark() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('darkMode', String(!isDark));
  $('dark-btn').textContent = isDark ? '☾ Dark' : '☀ Light';
}

const FS_CYCLE = ['sm', 'md', 'lg'];
function cycleFontSize() {
  const cur  = FS_CYCLE.find(f => document.body.classList.contains('fs-' + f)) || 'md';
  const next = FS_CYCLE[(FS_CYCLE.indexOf(cur) + 1) % FS_CYCLE.length];
  FS_CYCLE.forEach(f => document.body.classList.remove('fs-' + f));
  document.body.classList.add('fs-' + next);
  localStorage.setItem('fontSize', next);
  $('font-btn').textContent = { sm: 'Aa (S)', md: 'Aa (M)', lg: 'Aa (L)' }[next];
}

function clearChat() {
  if (!messages.length) return;
  if (!confirm('Clear the entire conversation? Saved (bookmarked) answers will be kept.')) return;
  messages = messages.filter(m => m.bookmarked);
  history  = [];
  messagesEl.innerHTML = '<div class="empty">Your answers will appear here</div>';
  setStatus('');
}

function exportChat() {
  const chat = messages.filter(m => !m.failed);
  if (!chat.length) { alert('Nothing to export yet.'); return; }

  const date  = new Date().toLocaleDateString();
  const lines = chat.map(m => {
    const role = m.role === 'user' ? '**You**' : `**Scholar** *(${PILL_LABELS[m.scope]})*`;
    return `### ${role}\n\n${m.text}`;
  });

  const md   = `# Pearl & Sir Gawain — Scholarly Q&A\n*Exported ${date}*\n\n---\n\n${lines.join('\n\n---\n\n')}`;
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `pearl-gawain-qa-${Date.now()}.md` });
  a.click();
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════════════════════
   VIEWS
   ══════════════════════════════════════════════════════════ */
function showChatView() {
  view = 'chat';
  chatView.classList.remove('hidden');
  bookmarkView.classList.add('hidden');
  $('bookmark-view-btn').classList.remove('active');
}

function showBookmarksView() {
  view = 'bookmarks';
  chatView.classList.add('hidden');
  bookmarkView.classList.remove('hidden');
  $('bookmark-view-btn').classList.add('active');
  renderAllMessages(bookmarkList, messages.filter(m => m.bookmarked));
}

/* ══════════════════════════════════════════════════════════
   CITATION GENERATOR
   ══════════════════════════════════════════════════════════ */
function bindCitationBar() {
  $$('.cite-btn').forEach(btn => {
    btn.addEventListener('click', () => generateCitation(btn.dataset.style));
  });
}

function generateCitation(style) {
  const poem = POEM_NAMES[scope];
  const q = `Provide a properly formatted ${style} bibliography entry for ${poem} ` +
    `by the Pearl-poet. Use Andrew and Waldron's edition: "The Poems of the Pearl Manuscript," ` +
    `edited by Malcolm Andrew and Ronald Waldron, University of Exeter Press, 2007. ` +
    `Also show how to cite a passage from the poem in-text in ${style} format.`;
  questionEl.value = q;
  autoResize(questionEl);
  updateCharCounter();
  questionEl.focus();
}

/* ══════════════════════════════════════════════════════════
   START
   ══════════════════════════════════════════════════════════ */
init();