/* ══════════════════════════════════════════════════════════
   Pearl & Sir Gawain — Scholarly Q&A
   app.js  ·  Requires style.css + index.html
   ══════════════════════════════════════════════════════════ */

/* ── Configuration ────────────────────────────────────────
   Replace this URL with your deployed Cloudflare Worker URL
   ───────────────────────────────────────────────────────── */
const WORKER_URL = 'functions/api/ask';

/* ── System prompts ───────────────────────────────────────── */
const BASE_SYSTEM =
  `You are a scholarly assistant specialising in the works of the Pearl-poet ` +
  `(the anonymous 14th-century author of Pearl, Sir Gawain and the Green Knight, ` +
  `Patience, and Cleanness). Answer questions accurately and helpfully. ` +
  `When quoting Middle English passages, include a brief Modern English translation ` +
  `in parentheses. Keep answers substantive (2–4 paragraphs) but avoid padding or preamble.`;

const SCOPE_CONTEXT = {
  both:      'You may draw on both Pearl and Sir Gawain and the Green Knight.',
  pearl:     'Focus your answer only on the poem Pearl.',
  sggk:      'Focus your answer only on Sir Gawain and the Green Knight.',
  patience:  'Focus your answer only on the poem Patience, the Pearl-poet\'s retelling of the Book of Jonah.',
  cleanness: 'Focus your answer only on Cleanness (also called Purity), the Pearl-poet\'s meditation on moral purity through biblical narratives.',
};

const PILL_LABELS = {
  both: 'Both poems', pearl: 'Pearl', sggk: 'Sir Gawain',
  patience: 'Patience', cleanness: 'Cleanness',
};

const MAX_CHARS = 600;

/* ── State ────────────────────────────────────────────────── */
let scope    = 'both';
let history  = [];   // Gemini-format [{role, parts:[{text}]}]
let messages = [];   // [{id, role, text, scope, bookmarked, ts, failed}]
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
const sugBox       = $('suggestions');
const sugsToggle   = $('sugs-toggle');

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
}

/* ── Preferences (localStorage) ──────────────────────────── */
function loadPreferences() {
  const dark = localStorage.getItem('darkMode') === 'true';
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');

  const fs = localStorage.getItem('fontSize') || 'md';
  document.body.classList.add('fs-' + fs);

  const saved = JSON.parse(localStorage.getItem('bookmarks') || '[]');
  saved.forEach(m => {
    m.bookmarked = true;
    messages.push(m);
  });
  updateBookmarkBadge();
}

function saveBookmarks() {
  const bk = messages.filter(m => m.bookmarked);
  localStorage.setItem('bookmarks', JSON.stringify(bk));
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
  let expanded = false;

  $$('.sug').forEach(btn => {
    btn.addEventListener('click', () => ask(btn.textContent.trim()));
  });

  sugsToggle.addEventListener('click', () => {
    expanded = !expanded;
    sugBox.classList.toggle('expanded', expanded);
    sugsToggle.textContent = expanded ? 'Show less ▴' : 'Show more ▾';
  });
}

/* ══════════════════════════════════════════════════════════
   INPUT
   ══════════════════════════════════════════════════════════ */
function bindInput() {
  questionEl.addEventListener('input', () => {
    autoResize(questionEl);
    updateCharCounter();
  });

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
   ASK  /  GEMINI via CLOUDFLARE WORKER
   ══════════════════════════════════════════════════════════ */
async function ask(question) {
  const q = (question ?? questionEl.value).trim();
  if (!q || loading) return;

  questionEl.value = '';
  autoResize(questionEl);
  updateCharCounter();
  setLoading(true);
  setStatus('Consulting the texts…');

  // Add user message
  const userMsg = addMessage('user', q);
  history.push({ role: 'user', parts: [{ text: q }] });

  // Show thinking bubble
  const thinkId = showThinking();

  const systemPrompt = `${BASE_SYSTEM}\n\n${SCOPE_CONTEXT[scope]}`;

  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: history,
        generationConfig: { maxOutputTokens: 1200 },
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.';
    history.push({ role: 'model', parts: [{ text: answer }] });
    hideThinking(thinkId);
    addMessage('assistant', answer, scope);
    setStatus('');
  } catch (err) {
    hideThinking(thinkId);
    const errText = formatError(err.message);
    addMessage('assistant', errText, scope, true);
    history.pop(); // remove failed user message from history
    setStatus('');
  }

  setLoading(false);
  scrollBottom();
}

function formatError(msg) {
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError'))
    return '⚠ Could not reach the server. Check that your Cloudflare Worker URL is set correctly in app.js and that the worker is deployed.';
  if (msg.includes('404'))
    return '⚠ Worker not found (404). Double-check the WORKER_URL in app.js.';
  return `⚠ Error: ${msg}`;
}

function setLoading(on) {
  loading = on;
  sendBtn.disabled = on;
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
  // Remove empty state
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
      ${escHtml(msg.text)}
      ${!isUser ? `<div><span class="pill pill-${msg.scope}">${PILL_LABELS[msg.scope] || ''}</span></div>` : ''}
    </div>
    <div class="msg-actions">
      ${!isUser ? `<button class="action-btn copy-btn" data-id="${msg.id}" title="Copy answer">⎘ Copy</button>` : ''}
      ${!isUser ? `<button class="action-btn bk-btn${msg.bookmarked ? ' bookmarked' : ''}" data-id="${msg.id}" title="${msg.bookmarked ? 'Unsave' : 'Save answer'}">
        ${msg.bookmarked ? '★ Saved' : '☆ Save'}
      </button>` : ''}
      ${msg.failed ? `<button class="action-btn retry-btn" data-id="${msg.id}" title="Retry">↺ Retry</button>` : ''}
    </div>`;

  // Bind action buttons
  const copyBtn  = div.querySelector('.copy-btn');
  const bkBtn    = div.querySelector('.bk-btn');
  const retryBtn = div.querySelector('.retry-btn');

  if (copyBtn)  copyBtn.addEventListener('click',  () => copyMessage(msg.id, copyBtn));
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
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

function scrollBottom() {
  const target = view === 'chat' ? messagesEl : bookmarkList;
  target.scrollTop = target.scrollHeight;
}

/* ── Thinking bubble ──────────────────────────────────────── */
let thinkCounter = 0;
function showThinking() {
  const id = 'think-' + thinkCounter++;
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

/* Copy ───────────────────────────────────────────────────── */
async function copyMessage(id, btn) {
  const msg = messages.find(m => m.id === id);
  if (!msg) return;
  try {
    await navigator.clipboard.writeText(msg.text);
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '⎘ Copy'; btn.classList.remove('copied'); }, 2000);
  } catch {
    prompt('Copy this text:', msg.text);
  }
}

/* Bookmark ───────────────────────────────────────────────── */
function toggleBookmark(id) {
  const msg = messages.find(m => m.id === id);
  if (!msg) return;
  msg.bookmarked = !msg.bookmarked;

  // Update button in chat view
  const chatBkBtn = messagesEl.querySelector(`.bk-btn[data-id="${id}"]`);
  if (chatBkBtn) {
    chatBkBtn.textContent = msg.bookmarked ? '★ Saved' : '☆ Save';
    chatBkBtn.classList.toggle('bookmarked', msg.bookmarked);
  }

  updateBookmarkBadge();
  saveBookmarks();

  // Refresh bookmarks view if open
  if (view === 'bookmarks') renderAllMessages(bookmarkList, messages.filter(m => m.bookmarked));
}

function updateBookmarkBadge() {
  const count = messages.filter(m => m.bookmarked).length;
  bookmarkCnt.textContent = count;
  bookmarkCnt.classList.toggle('hidden', count === 0);
}

/* Retry ──────────────────────────────────────────────────── */
function retryMessage(id) {
  const failedMsg = messages.find(m => m.id === id);
  if (!failedMsg) return;
  // Find the preceding user message
  const idx = messages.indexOf(failedMsg);
  const userMsg = messages.slice(0, idx).reverse().find(m => m.role === 'user');
  if (!userMsg) return;

  // Remove failed message from state and DOM
  messages.splice(idx, 1);
  const el = messagesEl.querySelector(`[data-id="${id}"]`);
  if (el) el.remove();

  ask(userMsg.text);
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

/* Dark mode ──────────────────────────────────────────────── */
function toggleDark() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('darkMode', String(!isDark));
  $('dark-btn').textContent = isDark ? '☾ Dark' : '☀ Light';
}

/* Font size ──────────────────────────────────────────────── */
const FS_CYCLE = ['sm', 'md', 'lg'];
function cycleFontSize() {
  const cur = FS_CYCLE.find(f => document.body.classList.contains('fs-' + f)) || 'md';
  const next = FS_CYCLE[(FS_CYCLE.indexOf(cur) + 1) % FS_CYCLE.length];
  FS_CYCLE.forEach(f => document.body.classList.remove('fs-' + f));
  document.body.classList.add('fs-' + next);
  localStorage.setItem('fontSize', next);
  $('font-btn').textContent = { sm: 'Aa (S)', md: 'Aa (M)', lg: 'Aa (L)' }[next];
}

/* Clear chat ─────────────────────────────────────────────── */
function clearChat() {
  if (!messages.length) return;
  if (!confirm('Clear the entire conversation? Saved (bookmarked) answers will be kept.')) return;
  messages = messages.filter(m => m.bookmarked);
  history  = [];
  messagesEl.innerHTML = '<div class="empty">Your answers will appear here</div>';
  setStatus('');
}

/* Export as Markdown ─────────────────────────────────────── */
function exportChat() {
  const chat = messages.filter(m => !m.failed);
  if (!chat.length) { alert('Nothing to export yet.'); return; }

  const date  = new Date().toLocaleDateString();
  const lines = chat.map(m => {
    const role = m.role === 'user' ? '**You**' : `**Scholar** *(${PILL_LABELS[m.scope]})*`;
    return `### ${role}\n\n${m.text}`;
  });

  const md = `# Pearl & Sir Gawain — Scholarly Q&A\n*Exported ${date}*\n\n---\n\n${lines.join('\n\n---\n\n')}`;
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url, download: `pearl-gawain-qa-${Date.now()}.md`
  });
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

const POEM_NAMES = {
  both:      'Pearl and Sir Gawain and the Green Knight',
  pearl:     'Pearl',
  sggk:      'Sir Gawain and the Green Knight',
  patience:  'Patience',
  cleanness: 'Cleanness',
};

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
