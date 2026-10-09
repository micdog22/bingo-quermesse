// Lógica pura do Bingo da Quermesse (sem DOM): cartelas determinísticas, padrões e cantador.

export const LETTERS = ['B', 'I', 'N', 'G', 'O'];
export const TOTAL_BALLS = 75;
export const MAX_CARD_NUMBER = 9999;
export const MAX_CARDS_PER_BATCH = 1000;
const SEED_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export class BingoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BingoError';
  }
}

/* ---------- pedras ---------- */

/** B 1–15, I 16–30, N 31–45, G 46–60, O 61–75. */
export function letterOf(n) {
  if (!Number.isInteger(n) || n < 1 || n > TOTAL_BALLS) throw new RangeError(`Pedra inválida: ${n}`);
  return LETTERS[Math.floor((n - 1) / 15)];
}

export function ballLabel(n) {
  return `${letterOf(n)} ${n}`;
}

/** Texto para a voz: "B... 5". */
export function speechText(n) {
  return `${letterOf(n)}... ${n}`;
}

export function columnRange(column) {
  return [column * 15 + 1, column * 15 + 15];
}

/* ---------- semente e gerador determinístico ---------- */

export function cryptoRandomInt(n) {
  const buf = new Uint32Array(1);
  const limit = 2 ** 32 - (2 ** 32 % n);
  do globalThis.crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % n;
}

/** Código curto e fácil de ditar, sem 0/O e 1/I: "K7M2-QX9P". */
export function newSeed(randomInt = cryptoRandomInt) {
  let code = '';
  for (let i = 0; i < 8; i += 1) code += SEED_ALPHABET[randomInt(SEED_ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function normalizeSeed(seed) {
  return String(seed ?? '').normalize('NFC').replace(/\s+/g, '').toUpperCase();
}

// Hash cyrb128 e gerador sfc32 (domínio público): rápidos, determinísticos e iguais em qualquer navegador.
function cyrb128(text) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i += 1) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a, b, c, d) {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function seededRandomInt(text) {
  const next = sfc32(...cyrb128(text));
  return (n) => Math.floor(next() * n);
}

/* ---------- cartelas ---------- */

function pick(rangeStart, count, randomInt) {
  const pool = Array.from({ length: 15 }, (_, i) => rangeStart + i);
  for (let i = 0; i < count; i += 1) {
    const j = i + randomInt(15 - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((x, y) => x - y);
}

/**
 * Uma cartela candidata para (semente, número, tentativa).
 * columns[c] traz os números da coluna c em ordem crescente; com centro livre, a coluna N tem 4.
 */
export function rawCard(seed, number, { freeCenter = true, attempt = 0 } = {}) {
  const randomInt = seededRandomInt(`bingo-quermesse|v1|${normalizeSeed(seed)}|${number}|${attempt}`);
  const columns = LETTERS.map((_, c) => pick(c * 15 + 1, freeCenter && c === 2 ? 4 : 5, randomInt));
  return { number, freeCenter, columns };
}

const cardKey = (card) => card.columns.map((col) => col.join(',')).join('|');

function checkSeed(seed) {
  const s = normalizeSeed(seed);
  if (!s) throw new BingoError('Informe o código das cartelas.');
  if (s.length > 40) throw new BingoError('O código pode ter no máximo 40 caracteres.');
  return s;
}

/**
 * Gera as cartelas 1..last e devolve as do intervalo pedido. Se alguma repetir uma anterior
 * (chance desprezível), ela é refeita com a tentativa seguinte, então todas são diferentes.
 */
export function generateCards(seed, { first = 1, count = 1, freeCenter = true } = {}, makeCard = rawCard) {
  checkSeed(seed);
  if (!Number.isInteger(first) || first < 1) throw new BingoError('A primeira cartela precisa ser um número inteiro a partir de 1.');
  if (!Number.isInteger(count) || count < 1 || count > MAX_CARDS_PER_BATCH) {
    throw new BingoError(`Gere de 1 a ${MAX_CARDS_PER_BATCH} cartelas por vez.`);
  }
  const last = first + count - 1;
  if (last > MAX_CARD_NUMBER) throw new BingoError(`A numeração vai até ${MAX_CARD_NUMBER}.`);
  const seen = new Set();
  const cards = [];
  for (let n = 1; n <= last; n += 1) {
    let attempt = 0;
    let card = makeCard(seed, n, { freeCenter, attempt });
    while (seen.has(cardKey(card))) {
      attempt += 1;
      card = makeCard(seed, n, { freeCenter, attempt });
    }
    seen.add(cardKey(card));
    if (n >= first) cards.push(card);
  }
  return cards;
}

export function cardAt(seed, number, { freeCenter = true } = {}) {
  if (!Number.isInteger(number) || number < 1 || number > MAX_CARD_NUMBER) {
    throw new BingoError(`Informe o número da cartela (de 1 a ${MAX_CARD_NUMBER}).`);
  }
  return generateCards(seed, { first: number, count: 1, freeCenter })[0];
}

/** Grade 5×5 por linhas; o centro livre vira null. */
export function cardGrid(card) {
  const grid = [];
  for (let r = 0; r < 5; r += 1) {
    const row = [];
    for (let c = 0; c < 5; c += 1) {
      if (card.freeCenter && c === 2) row.push(r === 2 ? null : card.columns[2][r < 2 ? r : r - 1]);
      else row.push(card.columns[c][r]);
    }
    grid.push(row);
  }
  return grid;
}

export function formatCardNumber(n) {
  return String(n).padStart(4, '0');
}

/* ---------- padrões ---------- */

export const PATTERNS = Object.freeze({
  line: 'Linha (horizontal, vertical ou diagonal)',
  corners: 'Quatro cantos',
  full: 'Cartela cheia',
});

export function markedGrid(card, called) {
  const set = called instanceof Set ? called : new Set(called);
  return cardGrid(card).map((row) => row.map((n) => n === null || set.has(n)));
}

export function lines() {
  const result = [];
  for (let i = 0; i < 5; i += 1) result.push({ name: `${i + 1}ª linha`, cells: [0, 1, 2, 3, 4].map((c) => [i, c]) });
  for (let c = 0; c < 5; c += 1) result.push({ name: `coluna ${LETTERS[c]}`, cells: [0, 1, 2, 3, 4].map((r) => [r, c]) });
  result.push({ name: 'diagonal ↘', cells: [0, 1, 2, 3, 4].map((i) => [i, i]) });
  result.push({ name: 'diagonal ↙', cells: [0, 1, 2, 3, 4].map((i) => [i, 4 - i]) });
  return result;
}

const CORNERS = [[0, 0], [0, 4], [4, 0], [4, 4]];

/** Confere um padrão: { ok, message, cells } (cells = casas que formam o padrão, quando completo). */
export function checkPattern(card, called, pattern) {
  const marked = markedGrid(card, called);
  const count = (cells) => cells.filter(([r, c]) => marked[r][c]).length;
  if (pattern === 'line') {
    const all = lines();
    const done = all.filter((line) => count(line.cells) === 5);
    if (done.length) {
      return { ok: true, message: `Linha completa: ${done.map((l) => l.name).join(', ')}.`, cells: done.flatMap((l) => l.cells) };
    }
    const best = Math.max(...all.map((line) => count(line.cells)));
    return { ok: false, message: `Nenhuma linha completa ainda. A mais perto tem ${best} de 5.`, cells: [] };
  }
  if (pattern === 'corners') {
    const n = count(CORNERS);
    return n === 4
      ? { ok: true, message: 'Os quatro cantos estão marcados.', cells: CORNERS }
      : { ok: false, message: `${n} de 4 cantos marcados.`, cells: [] };
  }
  if (pattern === 'full') {
    const cells = marked.flatMap((row, r) => row.map((_, c) => [r, c]));
    const missing = cells.length - count(cells);
    return missing === 0
      ? { ok: true, message: 'Cartela cheia!', cells }
      : { ok: false, message: `Falta${missing === 1 ? '' : 'm'} ${missing} ${missing === 1 ? 'número' : 'números'} para a cartela cheia.`, cells: [] };
  }
  throw new BingoError('Escolha um padrão para conferir.');
}

/** Números da cartela que ainda não foram cantados. */
export function missingNumbers(card, called) {
  const set = new Set(called);
  return card.columns.flat().filter((n) => !set.has(n)).sort((a, b) => a - b);
}

/* ---------- cantador ---------- */

export function sanitizeCalled(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const n of list) {
    if (Number.isInteger(n) && n >= 1 && n <= TOTAL_BALLS && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

export function remainingBalls(called) {
  const set = new Set(called);
  return Array.from({ length: TOTAL_BALLS }, (_, i) => i + 1).filter((n) => !set.has(n));
}

/** Sorteia a próxima pedra entre as que ainda não saíram. */
export function drawBall(called, randomInt = cryptoRandomInt) {
  const remaining = remainingBalls(called);
  if (remaining.length === 0) throw new BingoError('Todas as 75 pedras já foram sorteadas.');
  const ball = remaining[randomInt(remaining.length)];
  return { ball, called: [...called, ball] };
}

export function undoLast(called) {
  if (called.length === 0) return { ball: null, called: [] };
  return { ball: called[called.length - 1], called: called.slice(0, -1) };
}
