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
      name: 'The Green Knight\'s entrance (ll. 136–144)',
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
// Words are now looked up via the embedded GLOSSARY — the LLM
// handles only translation, prosody, and commentary.
const DECODE_SYSTEM =
  `You are an expert in Middle English philology specialising in the Pearl-poet and MS Cotton Nero A.x. ` +
  `Respond ONLY with a valid JSON object — no preamble, no markdown fences. ` +
  `Use exactly these three keys in this order:\n\n` +
  `1. "translation": string — fluent, complete Modern English rendering of the whole passage.\n\n` +
  `2. "commentary": string — 2-3 sentences of scholarly commentary (cite Andrew & Waldron 5th ed. or key critics).\n\n` +
  `3. "prosody": array — one object per verse line: ` +
  `{ "line": "<ME line exactly>", "pattern": "<alliterating sound e.g. aa/ax>", "note": "<one short sentence>" }\n\n` +
  `Return only the JSON object.`;

/* ── State ────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
let currentPoem = 'pearl';
let decoding    = false;

/* ══════════════════════════════════════════════════════════
   SHARED WORKER HELPER
   (same request/response format as app.js)
   ══════════════════════════════════════════════════════════ */
async function callWorker(systemPrompt, userMessage, maxTokens = 2000) {
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
  let buffer    = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Buffer across chunk boundaries so we never split an SSE line mid-parse
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep the potentially-incomplete last line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (!json || json === '[DONE]') continue;
      try {
        const chunk = JSON.parse(json);
        if (chunk.error) throw new Error(chunk.error.message || JSON.stringify(chunk.error));
        fullText += chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch (e) {
        // Only rethrow real API errors; swallow transient SSE parse failures
        if (e.message && !e.message.startsWith('JSON')) throw e;
      }
    }
  }

  return fullText;
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

  try {
    const poemNames = {
      pearl: 'Pearl', sggk: 'Sir Gawain and the Green Knight',
      patience: 'Patience', cleanness: 'Cleanness'
    };
    const userMessage =
      `Decode this passage from ${poemNames[currentPoem] || 'the Pearl-poet'} (MS Cotton Nero A.x):\n\n${text}`;

    const raw = await callWorker(DECODE_SYSTEM, userMessage, 1200);
    const data = parseJsonRobust(raw);
    if (!data) throw new Error('Could not parse model response');

    // Build words array from the embedded glossary
    const tokens = tokenisePassage(text);
    data.words = tokens.map(tok => {
      const entry = lookupWord(tok);
      return entry
        ? { me: tok, phonetic: entry.phonetic, modern: entry.modern, grammar: entry.grammar, found: true }
        : { me: tok, phonetic: '—', modern: '—', grammar: '—', found: false };
    });

    renderResults(data, text);
    $('decode-results').classList.add('visible');
  } catch (err) {
    alert('Decoding failed: ' + err.message);
  }

  $('decode-loading').classList.remove('visible');
  $('decode-btn').disabled = false;
  decoding = false;
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
   Fields are ordered translation → commentary → prosody → words
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
  renderProsody(data.prosody    || []);
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
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);font-style:italic;">No tokens found.</td></tr>';
    $('word-count-label').textContent = '';
    return;
  }
  const found  = words.filter(w => w.found).length;
  const total  = words.length;
  tbody.innerHTML = words.map(w => {
    const dim = !w.found ? ' style="opacity:0.45"' : '';
    return `<tr${dim}>
      <td class="gloss-me">${escHtml(w.me       || '')}</td>
      <td class="gloss-phon">${escHtml(w.phonetic || '')}</td>
      <td class="gloss-mod">${w.found ? escHtml(w.modern || '') : '<em style="color:var(--muted)">not in glossary</em>'}</td>
      <td class="gloss-gram">${escHtml(w.grammar  || '')}</td>
    </tr>`;
  }).join('');
  $('word-count-label').textContent = `${found}/${total} tokens matched`;
}

function renderProsody(lines) {
  const el = $('prosody-list');
  if (!lines.length) {
    el.innerHTML = '<div class="papers-empty">No prosody data returned.</div>';
    return;
  }
  el.innerHTML = lines.map(l => `
    <div class="prosody-row">
      <div class="prosody-line">${escHtml(l.line    || '')}</div>
      <div class="prosody-pattern">${escHtml(l.pattern || '')}</div>
      <div class="prosody-note">${escHtml(l.note    || '')}</div>
    </div>`
  ).join('');
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

/* ── Utils ──────────────────────────────────────────────────── */
function escHtml(t) {
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.addEventListener('DOMContentLoaded', init);