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
const DECODE_SYSTEM =
  `You are an expert in Middle English philology, specialising in the Pearl-poet and MS Cotton Nero A.x. ` +
  `When given a Middle English passage, respond ONLY with a single valid JSON object. ` +
  `No preamble, no markdown fences, no commentary outside the JSON. ` +
  `The object must have exactly these four keys:\n\n` +
  `1. "words": array — one object per distinct token (skip punctuation), each with:\n` +
  `   "me" (Middle English word as written), "phonetic" (plain-ASCII pronunciation hint, e.g. "PER-luh"), ` +
  `   "modern" (closest Modern English equivalent), "grammar" (brief note, e.g. "n. nom. sg.", "v. 3sg. pres.")\n\n` +
  `2. "translation": string — a complete, fluent Modern English rendering of the whole passage\n\n` +
  `3. "prosody": array — one object per line of verse, each with:\n` +
  `   "line" (the ME line), "pattern" (alliterating sounds, e.g. "aa/ax"), ` +
  `   "note" (one sentence on the line's metrical or sonic interest)\n\n` +
  `4. "commentary": string — 2–3 sentences of scholarly commentary, citing relevant critics or ` +
  `the Andrew & Waldron edition (5th ed., Exeter, 2007) where appropriate.\n\n` +
  `Return only the JSON object.`;

/* ── State ────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
let currentPoem = 'pearl';
let decoding    = false;

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

    // Strip any markdown fences
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const start = cleaned.indexOf('{');
    const end   = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object in response');

    const data = JSON.parse(cleaned.slice(start, end + 1));
    renderResults(data, text);
    $('decode-results').classList.add('visible');
  } catch (err) {
    alert('Decoding failed: ' + err.message);
  }

  $('decode-loading').classList.remove('visible');
  $('decode-btn').disabled = false;
  decoding = false;
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
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);font-style:italic;">No word data returned.</td></tr>';
    $('word-count-label').textContent = '';
    return;
  }
  tbody.innerHTML = words.map(w => `
    <tr>
      <td class="gloss-me">${escHtml(w.me       || '')}</td>
      <td class="gloss-phon">${escHtml(w.phonetic || '')}</td>
      <td class="gloss-mod">${escHtml(w.modern   || '')}</td>
      <td class="gloss-gram">${escHtml(w.grammar  || '')}</td>
    </tr>`
  ).join('');
  $('word-count-label').textContent = `${words.length} tokens`;
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
