import {
  LETTERS, TOTAL_BALLS, BingoError, ballLabel, letterOf, speechText, newSeed, normalizeSeed, generateCards, cardAt,
  cardGrid, formatCardNumber, markedGrid, checkPattern, missingNumbers, sanitizeCalled, drawBall, undoLast,
} from './bingo.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'bingo-quermesse:v1';

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.includes('-')) node.setAttribute(key, value);
    else node[key] = value;
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function showMessage(node, message) {
  node.textContent = message ?? '';
  node.hidden = !message;
}

/* ---------- estado ---------- */
function defaultState() {
  return {
    settings: { title: 'Bingo da Quermesse', info: '', first: 1, count: 20, perPage: 4, freeCenter: true, seed: newSeed() },
    called: [],
    voice: false,
    check: { number: '', seed: '', freeCenter: true, pattern: 'line' },
  };
}

function loadState() {
  const base = defaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== 'object') return base;
    const s = saved.settings ?? {};
    const settings = {
      title: typeof s.title === 'string' ? s.title.slice(0, 60) : base.settings.title,
      info: typeof s.info === 'string' ? s.info.slice(0, 80) : '',
      first: Number.isInteger(s.first) && s.first >= 1 ? s.first : 1,
      count: Number.isInteger(s.count) && s.count >= 1 ? s.count : 20,
      perPage: [1, 2, 4].includes(s.perPage) ? s.perPage : 4,
      freeCenter: typeof s.freeCenter === 'boolean' ? s.freeCenter : true,
      seed: typeof s.seed === 'string' && normalizeSeed(s.seed) ? normalizeSeed(s.seed) : base.settings.seed,
    };
    const c = saved.check ?? {};
    const check = {
      number: typeof c.number === 'string' ? c.number : '',
      seed: typeof c.seed === 'string' ? c.seed : '',
      freeCenter: typeof c.freeCenter === 'boolean' ? c.freeCenter : settings.freeCenter,
      pattern: ['line', 'corners', 'full'].includes(c.pattern) ? c.pattern : 'line',
    };
    return { settings, called: sanitizeCalled(saved.called), voice: saved.voice === true, check };
  } catch {
    return base;
  }
}

const state = loadState();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sem armazenamento disponível: segue sem salvar
  }
}

/* ---------- abas ---------- */
function setupTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = (tab, { focus = false, updateHash = true } = {}) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (focus) tab.focus();
    if (updateHash) history.replaceState(null, '', `#${tab.dataset.hash}`);
    if (tab.id === 'tab-conferir') prefillCheck();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (event) => {
      const moves = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
      if (!(event.key in moves)) return;
      event.preventDefault();
      select(tabs[(moves[event.key] + tabs.length) % tabs.length], { focus: true });
    });
  });
  const initial = tabs.find((t) => `#${t.dataset.hash}` === location.hash);
  if (initial) select(initial, { updateHash: false });
}

/* ---------- cartela ---------- */
function renderCard(card, { title = '', info = '', seed = '', marked = null, win = null } = {}) {
  const head = el('thead', {}, el('tr', {}, ...LETTERS.map((letter) => el('th', { scope: 'col', text: letter }))));
  const body = el('tbody', {}, ...cardGrid(card).map((row, r) => el('tr', {}, ...row.map((n, c) => {
    const cell = n === null
      ? el('td', { class: 'free-cell' }, el('span', { class: 'free-star', 'aria-hidden': 'true', text: '★' }), el('span', { class: 'free-label', text: 'LIVRE' }))
      : el('td', { text: String(n) });
    if (marked?.[r][c]) cell.classList.add('marked');
    if (win?.has(`${r},${c}`)) cell.classList.add('win');
    return cell;
  }))));
  return el('article', { class: 'bingo-card', 'aria-label': `Cartela ${formatCardNumber(card.number)}` },
    title ? el('p', { class: 'bc-title', text: title }) : null,
    info ? el('p', { class: 'bc-info', text: info }) : null,
    el('table', { class: 'bc-grid' }, head, body),
    el('p', { class: 'bc-footer' },
      el('span', {}, 'Cartela ', el('strong', { text: formatCardNumber(card.number) })),
      el('span', { text: `Código ${seed}` })));
}

/* ---------- folhas para imprimir ---------- */
function readCardSettings() {
  const s = state.settings;
  s.title = $('c-titulo').value.trim();
  s.info = $('c-info').value.trim();
  s.first = Number($('c-primeira').value);
  s.count = Number($('c-quantidade').value);
  s.perPage = Number(document.querySelector('input[name="c-por-folha"]:checked')?.value ?? 4);
  s.freeCenter = $('c-livre').checked;
  s.seed = normalizeSeed($('c-codigo').value);
}

function writeCardSettings() {
  const s = state.settings;
  $('c-titulo').value = s.title;
  $('c-info').value = s.info;
  $('c-primeira').value = String(s.first);
  $('c-quantidade').value = String(s.count);
  for (const radio of document.querySelectorAll('input[name="c-por-folha"]')) radio.checked = Number(radio.value) === s.perPage;
  $('c-livre').checked = s.freeCenter;
  $('c-codigo').value = s.seed;
}

let sheetsValid = false;
function renderSheets() {
  readCardSettings();
  save();
  const s = state.settings;
  const errorBox = $('c-erro');
  let cards;
  try {
    if (!Number.isInteger(s.first) || !Number.isInteger(s.count)) throw new BingoError('Use números inteiros na primeira cartela e na quantidade.');
    cards = generateCards(s.seed, { first: s.first, count: s.count, freeCenter: s.freeCenter });
  } catch (error) {
    showMessage(errorBox, error instanceof BingoError ? error.message : `Algo deu errado: ${error.message}`);
    $('c-resumo').textContent = '';
    $('folhas').replaceChildren();
    sheetsValid = false;
    return;
  }
  showMessage(errorBox, '');
  const sheets = [];
  for (let i = 0; i < cards.length; i += s.perPage) {
    const group = cards.slice(i, i + s.perPage);
    sheets.push(el('div', { class: `sheet per-${s.perPage}` },
      ...group.map((card) => renderCard(card, { title: s.title, info: s.info, seed: s.seed }))));
  }
  $('folhas').replaceChildren(...sheets);
  $('tamanho-pagina').textContent = `@page{size:A4 ${s.perPage === 2 ? 'landscape' : 'portrait'};margin:0}`;
  const last = s.first + cards.length - 1;
  $('c-resumo').textContent = `${cards.length} ${cards.length === 1 ? 'cartela' : 'cartelas'} (nº ${formatCardNumber(s.first)} a ${formatCardNumber(last)}) em ${sheets.length} ${sheets.length === 1 ? 'folha' : 'folhas'} A4.`;
  sheetsValid = true;
}

let sheetsTimer;
function scheduleSheets() {
  clearTimeout(sheetsTimer);
  sheetsTimer = setTimeout(renderSheets, 250);
}

function setupCards() {
  writeCardSettings();
  $('form-cartelas').addEventListener('input', scheduleSheets);
  $('form-cartelas').addEventListener('submit', (event) => event.preventDefault());
  $('c-codigo').addEventListener('blur', () => {
    $('c-codigo').value = normalizeSeed($('c-codigo').value);
  });
  $('c-novo-codigo').addEventListener('click', () => {
    $('c-codigo').value = newSeed();
    renderSheets();
  });
  $('c-imprimir').addEventListener('click', () => {
    clearTimeout(sheetsTimer);
    renderSheets();
    if (sheetsValid) window.print();
  });
  renderSheets();
}

/* ---------- cantador ---------- */
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;

function portugueseVoice() {
  const voices = synth?.getVoices() ?? [];
  return voices.find((v) => v.lang === 'pt-BR') ?? voices.find((v) => /^pt([-_]|$)/i.test(v.lang)) ?? null;
}

function updateVoiceHint() {
  const hint = $('voz-aviso');
  if (!synth) {
    $('voz').checked = false;
    $('voz').disabled = true;
    hint.textContent = 'Este navegador não oferece voz sintetizada.';
    hint.hidden = false;
    return;
  }
  const missing = state.voice && synth.getVoices().length > 0 && !portugueseVoice();
  hint.textContent = missing ? 'Não encontrei uma voz em português neste aparelho; a leitura pode sair com sotaque.' : '';
  hint.hidden = !missing;
}

function speak(n) {
  if (!synth || !state.voice) return;
  try {
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(speechText(n));
    utterance.lang = 'pt-BR';
    const voice = portugueseVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 0.9;
    synth.speak(utterance);
  } catch {
    // sem voz: o painel continua funcionando
  }
}

const boardCells = new Map();
function buildBoard() {
  const board = $('painel-pedras');
  board.replaceChildren(...LETTERS.map((letter, c) => {
    const cells = Array.from({ length: 15 }, (_, i) => {
      const n = c * 15 + i + 1;
      const cell = el('span', { class: 'board-cell' }, String(n), el('span', { class: 'sr-only' }));
      boardCells.set(n, cell);
      return cell;
    });
    return el('div', { class: 'board-line', role: 'group', 'aria-label': `Coluna ${letter}` },
      el('span', { class: 'board-letter', 'aria-hidden': 'true', text: letter }), ...cells);
  }));
}

function renderCaller({ animate = false } = {}) {
  const called = state.called;
  const last = called[called.length - 1];
  $('pedra-letra').textContent = last ? letterOf(last) : '';
  $('pedra-numero').textContent = last ? String(last) : '?';
  $('pedra-legenda').textContent = last ? 'Última pedra' : 'Nenhuma pedra sorteada ainda';
  $('pedra-contagem').textContent = `${called.length} de ${TOTAL_BALLS} pedras`;
  const ball = $('pedra');
  if (animate && !prefersReducedMotion()) {
    ball.classList.remove('pop');
    void ball.offsetWidth;
    ball.classList.add('pop');
  }
  const set = new Set(called);
  for (const [n, cell] of boardCells) {
    cell.classList.toggle('on', set.has(n));
    cell.classList.toggle('last', n === last);
    cell.lastChild.textContent = set.has(n) ? ' (sorteada)' : '';
  }
  $('historico-vazio').hidden = called.length > 0;
  $('historico').replaceChildren(...[...called].reverse().map((n) => el('li', { text: ballLabel(n) })));
  $('sortear-pedra').disabled = called.length >= TOTAL_BALLS;
  $('desfazer-pedra').disabled = called.length === 0;
}

function setupCaller() {
  buildBoard();
  $('voz').checked = state.voice && Boolean(synth);
  $('voz').addEventListener('change', () => {
    state.voice = $('voz').checked;
    save();
    updateVoiceHint();
  });
  synth?.addEventListener?.('voiceschanged', updateVoiceHint);
  updateVoiceHint();

  const status = $('cantar-status');
  $('sortear-pedra').addEventListener('click', () => {
    let result;
    try {
      result = drawBall(state.called);
    } catch (error) {
      status.textContent = error.message;
      return;
    }
    state.called = result.called;
    save();
    renderCaller({ animate: true });
    status.textContent = '';
    $('pedra-anuncio').textContent = `Pedra ${ballLabel(result.ball)}`;
    speak(result.ball);
    if (state.called.length === TOTAL_BALLS) status.textContent = 'Todas as 75 pedras já saíram.';
  });
  $('desfazer-pedra').addEventListener('click', () => {
    const { ball, called } = undoLast(state.called);
    if (ball === null) return;
    state.called = called;
    save();
    renderCaller();
    status.textContent = `Pedra ${ballLabel(ball)} devolvida ao globo.`;
  });
  const reset = $('novo-jogo');
  let armed = null;
  reset.addEventListener('click', () => {
    if (!armed) {
      reset.textContent = 'Clique de novo para zerar';
      armed = setTimeout(() => {
        reset.textContent = 'Novo jogo';
        armed = null;
      }, 3000);
      return;
    }
    clearTimeout(armed);
    armed = null;
    reset.textContent = 'Novo jogo';
    state.called = [];
    save();
    renderCaller();
    status.textContent = 'Novo jogo: todas as pedras voltaram para o globo.';
    $('sortear-pedra').focus();
  });
  renderCaller();
}

/* ---------- conferência ---------- */
// A conferência acompanha o código e o centro livre das cartelas, a não ser que a pessoa mude aqui.
let checkSeedEdited = false;
let checkFreeEdited = false;
function prefillCheck() {
  if (!checkSeedEdited) $('v-codigo').value = state.settings.seed;
  if (!checkFreeEdited) $('v-livre').checked = state.settings.freeCenter;
}

function setupCheck() {
  $('v-numero').value = state.check.number;
  $('v-padrao').value = state.check.pattern;
  prefillCheck();
  $('v-codigo').addEventListener('input', () => { checkSeedEdited = true; });
  $('v-livre').addEventListener('change', () => { checkFreeEdited = true; });
  $('form-conferir').addEventListener('submit', (event) => {
    event.preventDefault();
    const errorBox = $('v-erro');
    const output = $('v-resultado');
    state.check = {
      number: $('v-numero').value.trim(),
      seed: normalizeSeed($('v-codigo').value),
      freeCenter: $('v-livre').checked,
      pattern: $('v-padrao').value,
    };
    $('v-codigo').value = state.check.seed;
    save();
    let card;
    let result;
    try {
      const number = /^\d{1,4}$/.test(state.check.number) ? Number(state.check.number) : NaN;
      card = cardAt(state.check.seed, number, { freeCenter: state.check.freeCenter });
      result = checkPattern(card, state.called, state.check.pattern);
    } catch (error) {
      showMessage(errorBox, error instanceof BingoError ? error.message : `Algo deu errado: ${error.message}`);
      output.hidden = true;
      return;
    }
    showMessage(errorBox, '');
    const verdict = $('v-veredito');
    verdict.textContent = result.ok ? `✓ Bingo! ${result.message}` : `✗ Ainda não. ${result.message}`;
    verdict.className = `verdict ${result.ok ? 'ok' : 'no'}`;
    $('v-detalhe').textContent = state.called.length
      ? `Conferido com ${state.called.length} ${state.called.length === 1 ? 'pedra cantada' : 'pedras cantadas'}. Casas destacadas já saíram.`
      : 'Nenhuma pedra foi cantada ainda neste navegador.';
    const win = new Set(result.cells.map(([r, c]) => `${r},${c}`));
    $('v-cartela').replaceChildren(renderCard(card, {
      title: state.settings.title, info: state.settings.info, seed: state.check.seed, marked: markedGrid(card, state.called), win,
    }));
    const missing = missingNumbers(card, state.called);
    $('v-faltam').textContent = missing.length
      ? `Números da cartela que ainda não saíram: ${missing.map(ballLabel).join(', ')}.`
      : 'Todos os números desta cartela já saíram.';
    output.hidden = false;
  });
}

setupTabs();
setupCards();
setupCaller();
setupCheck();
