/* ══════════════════════════════════════════════════════════
   explore.js — Verse Decoder
   Uses the same /api/ask worker as the Q&A tool (Gemini)
   ══════════════════════════════════════════════════════════ */
'use strict';

const WORKER_URL = '/api/ask';

/* ── Pre-loaded passages ──────────────────────────────────── */
const PASSAGES = {
  pearl: [
    {
      name: 'Opening stanza (ll. 1–8)',
      text: `Perle, plesaunte to prynces paye
To clanly clos in golde so clere:
Oute of oryent, I hardyly saye,
Ne proved I never her precios pere.
So rounde, so reken in uche araye,
So smal, so smoþe her sydez were,
Quere-so-ever I jugged gemmes gaye,
I sette hyr sengeley in synglere.`
    },
    {
      name: 'The dreamer laments (ll. 9–16)',
      text: `Allas! I leste hyr in on erbere;
Þurȝ gresse to grounde hit fro me yot.
I dewyne, fordolked of luf-daungere
Of þat pryvy perle wythouten spot.
Syþen in þat spote hit fro me sprange,
Ofte haf I wayted, wyschande þat wele,
Þat wont watz whyle devoyde my wrange
And heven my happe and al my hele.`
    },
    {
      name: 'New Jerusalem (ll. 985–992)',
      text: `As John þe apostel hit syȝ wyth syȝt,
I syȝe þat cyty of gret renoun,
Jerusalem so nwe and ryally dyȝt,
As hit watz lyȝt fro þe heven adoun.
Þe borȝ watz al of brende golde bryȝt
As glemande glas burnist broun,
Wyth gentyl gemmez anunder pyȝt,
Wyth bantlez twelve on basyng boun.`
    }
  ],
  sggk: [
    {
      name: 'Opening lines (ll. 1–7)',
      text: `SIÞEN þe sege and þe assaut watz sesed at Troye,
Þe borȝ brittened and brent to brondez and askez,
Þe tulk þat þe trammes of tresoun þer wroȝt
Watz tried for his tricherie, þe trewest on erþe:
Hit watz Ennias þe athel, and his highe kynde,
Þat siþen depreced prouinces, and patrounes bicome
Welneȝe of al þe wele in þe west iles.`
    },
    {
      name: 'The Green Knight's entrance (ll. 136–144)',
      text: `Þer hales in at þe halle dor an aghlich mayster,
On þe most on þe molde on mesure hyghe;
Fro þe swyre to þe þwange so sware and so þik,
And his lyndes and his lymes so longe and so grete,
Half etayn in erde I hope þat he were,
Bot mon most I algate mynn hym to bene,
And þat þe myriest in his muckel þat myȝt ride;
For of bak and of brest al were his bodi sturne,
Both his wombe and his wast were worthily smale.`
    },
    {
      name: 'Bob-and-wheel (ll. 232–236)',
      text: `Now þenk wel, Sir Gawan,
For woþe þat þou ne wonde
Þis aventure for to frayn
Þat þou hatz tan on honde.`
    }
  ],
  patience: [
    {
      name: 'Jonah flees (ll. 99–106)',
      text: `Jonas toward port Tarce prestly he rynnez;
He fonde þer a fayr schyp to þe fare redy,
Maches hym with þe maryneres, makes her paye
For to tow hym into Tarce as tyd as þay myȝt.
Bot hym lakked no lore, þat loked to God,
For efte he stod up in his stede and stared on hym even,
Wyth his wayke wynd, and hys walowande wendes,
Drof hym doun þe dep see to drowpen and drenche.`
    },
    {
      name: 'Inside the whale (ll. 273–280)',
      text: `And þer he fest on a flot þat fayled hym noȝt,
Þe byst of the bely þat hym bore fro,
He slydes by þe slopes doun at his syde,
Til he blunt in a blok as brod as a halle;
And þer he festnes þe fete and fathmez aboute,
And stod vp in his stomak þat stank as þe devel.
Þer in saym and in sorȝe þat savoured as helle
Þer watz bylded his bour þat wyl no bale suffer.`
    }
  ],
  cleanness: [
    {
      name: 'Opening lines (ll. 1–8)',
      text: `Clannesse who-so kyndly cowþe comende,
And rekken vp alle þe resounz þat ho by ryȝt askez,
Fayre formez myȝt he fynde in forþering his speche,
And in þe contraré carpe and comfort perchance.
For wonder wroth is þe Wyȝ þat wroȝt alle þynges
Wyth þe freke þat in fylþe folȝez hym after,
As renkes of relygioun þat reden and syngen
And aprochen to hys presens, and prestes arn called.`
    },
    {
      name: "Belshazzar's Feast (ll. 1441–1448)",
      text: `Þe kyng comaunded anoon to calle alle his heþe men,
His astrologes and his sages, and his scole maystersȝ,
Þe warlawes and wycchecraftes and warlokez als;
"Expowne me þis writyng and þe worde rede,
Þe man þat cowþe þe menyng and telle in myn herberȝ
Schal be clad in clatour with a coler of golde,
And I schal gyf hym þis gyfte and gryþe hym full nobly,
Þe þrydde prynces place to passe alle oþer."`
    }
  ]
};

/* ── System prompt ────────────────────────────────────────── */
// Kept minimal — context only. The JSON schema lives in the
// user message where Gemini always reads it, and the response
// is prefilled with '{"translation":' so JSON is guaranteed.
const DECODE_SYSTEM =
  `You are a Middle English philology expert specialising in the Pearl-poet ` +
  `and MS Cotton Nero A.x. You respond only with raw JSON.`;

/* ── State ────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
let currentPoem = 'pearl';
let decoding    = false;

/* ══════════════════════════════════════════════════════════
   SHARED WORKER HELPER
   (same request/response format as app.js)
   ══════════════════════════════════════════════════════════ */
async function callWorker(systemPrompt, userMessage, maxTokens = 1200, prefill = '') {
  // Build contents array; if prefill provided, add a partial model turn so
  // Gemini MUST continue in JSON from that exact point.
  const contents = [{ role: 'user', parts: [{ text: userMessage }] }];
  if (prefill) contents.push({ role: 'model', parts: [{ text: prefill }] });

  const res = await fetch(WORKER_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: maxTokens },
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body || res.statusText}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let streamed  = '';
  let buffer    = '';

  const processLine = line => {
    if (!line.startsWith('data: ')) return;
    const json = line.slice(6).trim();
    if (!json || json === '[DONE]') return;
    try {
      const chunk = JSON.parse(json);
      if (chunk.error) throw new Error(chunk.error.message || JSON.stringify(chunk.error));
      streamed += chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (e) {
      if (e.message && !e.message.startsWith('JSON') && !e.message.startsWith('Unexpected')) throw e;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      buffer.split('\n').forEach(processLine);
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(processLine);
  }

  // Prepend the prefill seed so the caller gets the full JSON string
  return prefill + streamed;
}

/* ══════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════ */
function init() {
  bindPoemSelect();
  bindPassageSelect();
  bindDecodeBtn();
  bindCopyTranslation();
  populatePassages('pearl');
  initCorpusStatusBar();
}

function bindPoemSelect() {
  $('poem-select').addEventListener('change', e => {
    currentPoem = e.target.value;
    populatePassages(currentPoem);
  });
}

function populatePassages(poem) {
  const sel = $('passage-select');
  sel.innerHTML = '';
  PASSAGES[poem].forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
  sel.dispatchEvent(new Event('change'));
}

function bindPassageSelect() {
  $('passage-select').addEventListener('change', e => {
    const idx     = parseInt(e.target.value, 10);
    const passage = PASSAGES[currentPoem]?.[idx];
    if (passage) {
      $('passage-input').value = passage.text;
      $('passage-poem-label').textContent = passage.name;
    }
  });
}

/* ══════════════════════════════════════════════════════════
   DECODE
   ══════════════════════════════════════════════════════════ */
function bindDecodeBtn() {
  $('decode-btn').addEventListener('click', decode);
}

async function decode() {
  if (decoding) return;
  const text = $('passage-input').value.trim();
  if (!text) return;

  decoding = true;
  $('decode-btn').disabled = true;
  $('decode-loading').classList.add('visible');
  $('decode-results').classList.remove('visible');
  const errEl = $('decode-error');
  if (errEl) errEl.style.display = 'none';

  try {
    const poemNames = {
      pearl: 'Pearl', sggk: 'Sir Gawain and the Green Knight',
      patience: 'Patience', cleanness: 'Cleanness'
    };

    // JSON schema lives in the user message (always read by Gemini).
    // Response is prefilled with '{"translation":' — this forces JSON output.
    const userMessage =
      `Passage from ${poemNames[currentPoem] || 'the Pearl-poet'} (MS Cotton Nero A.x):\n\n${text}\n\n` +
      `Reply with ONLY this JSON object (no text before or after, no markdown fences):\n` +
      `{\n` +
      `  "translation": "complete fluent Modern English rendering",\n` +
      `  "commentary": "2-3 sentences of scholarly commentary citing Andrew & Waldron 5th ed.",\n` +
            `}`;

    const raw = await callWorker(DECODE_SYSTEM, userMessage, 1200, '{"translation":');
    const data = parseJsonRobust(raw);
    if (!data) throw new Error('Could not parse model response');

    // Build words array: Wiktionary live → static glossary fallback
    const tokens = tokenisePassage(text);
    // Show glossary table with loading state immediately
    renderGlossaryLoading(tokens.length);
    $('decode-results').classList.add('visible');
    // Fetch all tokens in parallel (Wiktionary handles concurrent requests fine)
    data.words = await Promise.all(tokens.map(lookupWordFull));
    // Re-render glossary with live results
    renderGlossary(data.words);

    renderResults(data, text);

    // Corpus passage lookup — non-blocking
    const poemKey = { pearl:'pearl', sggk:'sggk', patience:'patience', cleanness:'cleanness' }[currentPoem];
    if (CORPUS_STATUS === 'ready') {
      renderCorpusMatch(poemKey, text);
    } else {
      onCorpusReady(() => renderCorpusMatch(poemKey, text));
    }
  } catch (err) {
    showDecodeError(err.message, typeof raw !== 'undefined' ? raw : '');
  }

  $('decode-loading').classList.remove('visible');
  $('decode-btn').disabled = false;
  decoding = false;
}

function showDecodeError(message, raw) {
  const preview = raw
    ? `<details style="margin-top:10px"><summary style="cursor:pointer;color:var(--muted);font-size:12px">Show model response</summary><pre style="font-size:11px;white-space:pre-wrap;margin-top:6px;color:var(--muted)">${escHtml(raw.slice(0, 600))}</pre></details>`
    : '';
  // Show error inline below the decode button instead of an alert
  let errEl = $('decode-error');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.id = 'decode-error';
    errEl.style.cssText = 'margin-top:12px;padding:12px 16px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;font-family:var(--serif);font-size:14px;color:var(--danger,#c0392b)';
    $('decode-loading').after(errEl);
  }
  errEl.innerHTML = `⚠ ${escHtml(message)}${preview}`;
  errEl.style.display = 'block';
}

/* ══════════════════════════════════════════════════════════
   WIKTIONARY LIVE LOOKUP
   Uses the Wiktionary REST API to look up Middle English
   (language code: enm) definitions for each token.
   Falls back to the static glossary.js for words not on
   Wiktionary, then marks unmatched tokens as "not found".
   ══════════════════════════════════════════════════════════ */

// Session cache: normalised word → result object (avoids duplicate API calls)
const WIKT_CACHE = new Map();

const WIKT_BASE = 'https://en.wiktionary.org/api/rest_v1/page/definition';

/* Attempt variants of a word to maximise Wiktionary hit rate */
function spellingVariants(word) {
  const variants = new Set([word]);

  // ME → Modern normalisation
  const norm = word
    .replace(/þ/g, 'th')
    .replace(/ȝ/g, 'y')
    .replace(/æ/g, 'ae')
    .replace(/ð/g, 'th');
  variants.add(norm);

  // Common ME suffix endings
  for (const [suffix, replacement] of [
    [/ez$/, ''],  [/ez$/, 'e'],
    [/z$/,  ''],  [/ed$/, ''],  [/ed$/, 'e'],
    [/ande$/, ''], [/ande$/, 'e'],
    [/e$/,  ''],  [/ly$/, ''],
  ]) {
    const stem = word.replace(suffix, replacement);
    if (stem && stem !== word) variants.add(stem);
  }

  return [...variants];
}

/* Fetch one word from Wiktionary — returns {modern, grammar, source} or null */
async function lookupWiktionary(word) {
  if (WIKT_CACHE.has(word)) return WIKT_CACHE.get(word);

  for (const variant of spellingVariants(word)) {
    try {
      const res = await fetch(
        `${WIKT_BASE}/${encodeURIComponent(variant)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) continue;

      const data = await res.json();

      // Prefer the Middle English section (enm), then check other sections
      // for explicit Middle English labels
      const candidates = [
        ...(data.enm || []),
        ...(data.en  || []).filter(e =>
          (e.language || '').toLowerCase().includes('middle english') ||
          (e.partOfSpeech || '').toLowerCase().includes('middle english')
        ),
      ];

      if (!candidates.length) continue;

      const entry    = candidates[0];
      const defObj   = entry.definitions?.[0];
      if (!defObj) continue;

      // Strip HTML tags from definition text
      const modern   = (defObj.definition || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .trim()
        .slice(0, 80);

      if (!modern) continue;

      const result = {
        modern,
        phonetic: '—',
        grammar:  entry.partOfSpeech || '',
        source:   'Wiktionary',
        found:    true,
      };
      WIKT_CACHE.set(word, result);
      return result;
    } catch { /* network error — try next variant */ }
  }

  WIKT_CACHE.set(word, null); // cache miss so we don't retry
  return null;
}

/* Full lookup chain: Wiktionary → static glossary → not found */
async function lookupWordFull(rawTok) {
  const word = rawTok.toLowerCase().trim();

  // 1. Live Wiktionary lookup
  const wikt = await lookupWiktionary(word);
  if (wikt) return { me: rawTok, ...wikt };

  // 2. Static glossary fallback (Pearl-poet specific entries)
  const gloss = lookupWord(word);
  if (gloss) return {
    me: rawTok,
    phonetic: gloss.phonetic,
    modern:   gloss.modern,
    grammar:  gloss.grammar,
    source:   'Glossary',
    found:    true,
  };

  // 3. Not found
  return { me: rawTok, phonetic: '—', modern: '—', grammar: '—', source: '', found: false };
}

/* Show placeholder rows while Wiktionary is fetching */
function renderGlossaryLoading(count) {
  const tbody = $('gloss-tbody');
  tbody.innerHTML = `<tr>
    <td colspan="4" style="text-align:center;padding:16px;color:var(--muted);font-family:var(--serif);font-style:italic">
      Looking up ${count} tokens in Wiktionary
      <span class="thinking-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>
    </td></tr>`;
  $('word-count-label').textContent = '';
}

/* ── Tokenise a Middle English passage into word tokens ──── */
function tokenisePassage(text) {
  // Split on whitespace and punctuation, keep only real word tokens
  return text
    .split(/[\s\n\r]+/)
    .map(t => t.replace(/^[^\w\þþȝ]+|[^\w\þþȝ]+$/gi, '').toLowerCase())
    .filter(t => t.length > 0 && !/^[0-9]+$/.test(t));
}

/* ══════════════════════════════════════════════════════════
   ROBUST JSON PARSER
   Handles truncated responses (words array cut mid-stream).
   Fields are ordered translation → commentary → words
   so the most useful parts survive even partial responses.
   ══════════════════════════════════════════════════════════ */
function parseJsonRobust(raw) {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start   = cleaned.indexOf('{');
  if (start === -1) throw new Error('No JSON object in response');

  const body = cleaned.slice(start);

  // Attempt 1: normal parse up to last '}'
  const end = body.lastIndexOf('}');
  if (end !== -1) {
    try { return JSON.parse(body.slice(0, end + 1)); } catch {}
  }

  // Attempt 2: patch a truncated object
  return patchTruncated(body);
}

function patchTruncated(s) {
  // Walk character-by-character tracking string / bracket state
  let inStr = false, esc = false, braces = 0, brackets = 0;

  for (const ch of s) {
    if (esc)            { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"')     { inStr = !inStr; continue; }
    if (inStr)          continue;
    if (ch === '{')  braces++;
    else if (ch === '}') braces--;
    else if (ch === '[') brackets++;
    else if (ch === ']') brackets--;
  }

  let patched = s;

  // Close any open string literal
  if (inStr) patched += '"';

  // Trim back to the last complete array entry if an array is unclosed
  if (brackets > 0) {
    const lastGood = patched.lastIndexOf('},');
    if (lastGood > 0) patched = patched.slice(0, lastGood + 1);
    for (let i = 0; i < brackets; i++) patched += ']';
  }

  // Recount and close unclosed braces
  let open = 0;
  inStr = false; esc = false;
  for (const ch of patched) {
    if (esc)            { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"')     { inStr = !inStr; continue; }
    if (inStr)          continue;
    if (ch === '{')  open++;
    else if (ch === '}') open--;
  }
  for (let i = 0; i < open; i++) patched += '}';

  try { return JSON.parse(patched); } catch { return null; }
}

/* ══════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════ */
function renderResults(data, originalText) {
  renderSideBySide(originalText, data.translation || '');
  renderGlossary(data.words     || []);
  renderCommentary(data.commentary || '');
}

function renderSideBySide(meText, modTranslation) {
  const lines = meText.split('\n').filter(l => l.trim());
  $('me-display').innerHTML = lines.map(l =>
    `<span class="me-line">${escHtml(l)}</span>`
  ).join('');
  $('mod-display').innerHTML = escHtml(modTranslation).replace(/\n/g, '<br>');
}

function renderGlossary(words) {
  const tbody = $('gloss-tbody');
  if (!words.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);font-style:italic;">No tokens found.</td></tr>';
    $('word-count-label').textContent = '';
    return;
  }
  const found  = words.filter(w => w.found).length;
  const wikt   = words.filter(w => w.source === 'Wiktionary').length;
  const total  = words.length;

  const sourceBadge = src => {
    if (src === 'Wiktionary') return '<span style="font-size:10px;background:var(--purple-l);color:var(--purple);padding:1px 5px;border-radius:3px;font-family:var(--sans);font-weight:700">Wikt</span>';
    if (src === 'Glossary')   return '<span style="font-size:10px;background:var(--accent-l);color:var(--accent);padding:1px 5px;border-radius:3px;font-family:var(--sans);font-weight:700">MED</span>';
    return '';
  };

  tbody.innerHTML = words.map(w => {
    const dim = !w.found ? ' style="opacity:0.45"' : '';
    return `<tr${dim}>
      <td class="gloss-me">${escHtml(w.me || '')}</td>
      <td class="gloss-phon">${escHtml(w.phonetic || '')}</td>
      <td class="gloss-mod">${w.found ? escHtml(w.modern || '') : '<em style="color:var(--muted)">not found</em>'}</td>
      <td class="gloss-gram">${escHtml(w.grammar || '')}</td>
      <td>${w.found ? sourceBadge(w.source) : ''}</td>
    </tr>`;
  }).join('');
  $('word-count-label').textContent =
    `${found}/${total} matched · ${wikt} from Wiktionary`;
}


function renderCommentary(text) {
  $('commentary-text').innerHTML = text.split('\n').filter(p => p.trim()).map(p =>
    `<p>${escHtml(p)}</p>`
  ).join('');
}

function bindCopyTranslation() {
  $('copy-translation-btn').addEventListener('click', async () => {
    const text = $('mod-display').textContent;
    try {
      await navigator.clipboard.writeText(text);
      $('copy-translation-btn').textContent = '✓ Copied';
      setTimeout(() => { $('copy-translation-btn').textContent = '⎘ Copy translation'; }, 2000);
    } catch { prompt('Copy this translation:', text); }
  });
}


/* ══════════════════════════════════════════════════════════
   CORPUS INTEGRATION
   ══════════════════════════════════════════════════════════ */
function initCorpusStatusBar() {
  // Show a small status pill near the decode button
  let bar = $('corpus-status');
  if (!bar) {
    bar = document.createElement('span');
    bar.id = 'corpus-status';
    bar.style.cssText =
      'font-family:var(--sans);font-size:11px;color:var(--muted);' +
      'margin-left:10px;transition:color 0.2s;';
    const actions = document.querySelector('.decode-actions');
    if (actions) actions.appendChild(bar);
  }

  const update = (status) => {
    const msgs = {
      idle:    '',
      loading: '⟳ Loading corpus…',
      ready:   '',
      error:   '⚠ Corpus unavailable'
    };
    bar.textContent = msgs[status] || '';
    if (status === 'ready' && CORPUS) {
      const stats = corpusStats();
      if (stats) {
        const total = Object.values(stats).reduce((a,b) => a+b, 0);
        bar.textContent = `✓ Corpus loaded (${total.toLocaleString()} lines)`;
        bar.style.color = 'var(--green)';
        setTimeout(() => { bar.textContent = ''; }, 3000);
      }
    }
  };

  update(CORPUS_STATUS);
  onCorpusReady(update);
  // Also track loading state
  if (CORPUS_STATUS === 'loading') {
    const interval = setInterval(() => {
      if (CORPUS_STATUS !== 'loading') {
        update(CORPUS_STATUS);
        clearInterval(interval);
      }
    }, 400);
  }
}

function renderCorpusMatch(poem, pastedText) {
  // Remove any previous match panel
  const old = $('corpus-match-panel');
  if (old) old.remove();

  const result = findPassage(poem, pastedText);
  if (!result.found) return;

  // Build a panel showing line numbers and context
  const panel = document.createElement('div');
  panel.id = 'corpus-match-panel';
  panel.className = 'result-section';
  panel.style.marginBottom = '14px';

  const poemNames = { pearl:'Pearl', sggk:'Sir Gawain', patience:'Patience', cleanness:'Cleanness' };

  const contextHtml = result.context.map(line => {
    const isMatch = line.num >= result.lineStart && line.num <= result.lineEnd;
    const style = isMatch
      ? 'background:var(--accent-l);border-radius:3px;padding:1px 4px;font-weight:600;'
      : '';
    return `<div style="display:flex;gap:12px;align-items:baseline;margin-bottom:2px">` +
      `<span style="font-family:var(--sans);font-size:10px;color:var(--muted);min-width:28px;text-align:right;flex-shrink:0">${line.num}</span>` +
      `<span style="font-family:var(--serif);font-size:14px;font-style:italic;color:var(--text);${style}">${escHtml(line.text)}</span>` +
      `</div>`;
  }).join('');

  panel.innerHTML = `
    <div class="result-section-header">
      <div class="result-section-title">
        ◉ Found in corpus
        <span style="font-family:var(--sans);font-size:11px;font-weight:400;color:var(--muted);margin-left:8px">
          ${escHtml(poemNames[poem] || poem)} · lines ${result.lineStart}–${result.lineEnd}
        </span>
      </div>
    </div>
    <div class="result-section-body" style="padding:14px 18px">
      <div style="font-family:var(--sans);font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:10px">Context (±3 lines)</div>
      ${contextHtml}
      <div style="margin-top:10px;font-family:var(--sans);font-size:11px;color:var(--muted)">
        Source: <em>Early English Alliterative Poems</em>, ed. R. Morris, EETS 1869 (Project Gutenberg).
      </div>
    </div>`;

  // Insert before the side-by-side section
  const firstSection = $('decode-results').querySelector('.result-section');
  if (firstSection) {
    $('decode-results').insertBefore(panel, firstSection);
  } else {
    $('decode-results').appendChild(panel);
  }
}

/* ── Utils ──────────────────────────────────────────────────── */
function escHtml(t) {
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.addEventListener('DOMContentLoaded', init);