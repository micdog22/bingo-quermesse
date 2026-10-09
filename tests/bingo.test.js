import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LETTERS, TOTAL_BALLS, BingoError, letterOf, ballLabel, speechText, columnRange, newSeed, normalizeSeed, seededRandomInt,
  rawCard, generateCards, cardAt, cardGrid, formatCardNumber, markedGrid, checkPattern, missingNumbers,
  sanitizeCalled, remainingBalls, drawBall, undoLast, cryptoRandomInt,
} from '../src/bingo.js';

const SEED = 'K7M2-QX9P';

function assertValidCard(card) {
  const all = card.columns.flat();
  assert.equal(new Set(all).size, all.length, 'sem números repetidos');
  card.columns.forEach((col, c) => {
    const [min, max] = columnRange(c);
    assert.equal(col.length, card.freeCenter && c === 2 ? 4 : 5, `tamanho da coluna ${LETTERS[c]}`);
    for (const n of col) assert.ok(n >= min && n <= max, `${n} fora da coluna ${LETTERS[c]}`);
    assert.deepEqual(col, [...col].sort((a, b) => a - b), 'coluna em ordem crescente');
  });
  const grid = cardGrid(card);
  assert.equal(grid.length, 5);
  assert.ok(grid.every((row) => row.length === 5));
  assert.equal(grid[2][2] === null, card.freeCenter);
}

test('letras das pedras: B 1–15, I 16–30, N 31–45, G 46–60, O 61–75', () => {
  const expected = { 1: 'B', 15: 'B', 16: 'I', 30: 'I', 31: 'N', 45: 'N', 46: 'G', 60: 'G', 61: 'O', 75: 'O' };
  for (const [n, letter] of Object.entries(expected)) assert.equal(letterOf(Number(n)), letter);
  assert.equal(ballLabel(42), 'N 42');
  assert.equal(speechText(5), 'B... 5');
  for (const bad of [0, 76, 2.5, '5']) assert.throws(() => letterOf(bad), RangeError);
});

test('código das cartelas: formato e normalização', () => {
  for (let i = 0; i < 200; i += 1) assert.match(newSeed(), /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  assert.equal(normalizeSeed('  k7m2 - qx9p '), 'K7M2-QX9P');
  assert.deepEqual(cardAt('k7m2-qx9p', 7), cardAt(SEED, 7));
});

test('cartelas válidas, com e sem centro livre', () => {
  for (const freeCenter of [true, false]) {
    for (const card of generateCards(SEED, { count: 300, freeCenter })) assertValidCard(card);
  }
});

test('determinismo: a cartela N depende só do código e de N', () => {
  const batch = generateCards(SEED, { count: 100 });
  assert.deepEqual(cardAt(SEED, 42), batch[41]);
  assert.deepEqual(generateCards(SEED, { first: 40, count: 5 })[2], batch[41]);
  assert.deepEqual(cardAt(SEED, 42), cardAt(SEED, 42));
  assert.equal(batch[41].number, 42);
  assert.notDeepEqual(cardAt('OUTRO-CODIGO', 42).columns, batch[41].columns);
  assert.notDeepEqual(cardAt(SEED, 43).columns, batch[41].columns);
  const fixed = cardAt('ABCD-EFGH', 1);
  assert.deepEqual(fixed, cardAt('ABCD-EFGH', 1), 'mesmo resultado em chamadas separadas');
});

test('500 cartelas, todas diferentes', () => {
  for (const freeCenter of [true, false]) {
    const cards = generateCards(newSeed(), { count: 500, freeCenter });
    const keys = new Set(cards.map((c) => JSON.stringify(c.columns)));
    assert.equal(keys.size, 500);
  }
});

test('se duas cartelas saírem iguais, a repetida é refeita', () => {
  const calls = [];
  const clumsy = (seed, number, opts) => {
    calls.push([number, opts.attempt]);
    return rawCard(seed, number === 2 && opts.attempt === 0 ? 1 : number, opts);
  };
  const cards = generateCards(SEED, { count: 3 }, clumsy);
  assert.notDeepEqual(cards[1].columns, cards[0].columns);
  assert.deepEqual(calls, [[1, 0], [2, 0], [2, 1], [3, 0]]);
});

test('gerador com semente é estável e espalhado', () => {
  const a = seededRandomInt('teste');
  const b = seededRandomInt('teste');
  const seqA = Array.from({ length: 20 }, () => a(15));
  assert.deepEqual(seqA, Array.from({ length: 20 }, () => b(15)));
  const counts = new Array(15).fill(0);
  const r = seededRandomInt('distribuição');
  for (let i = 0; i < 15000; i += 1) counts[r(15)] += 1;
  assert.ok(counts.every((c) => c > 850 && c < 1150), counts.join(','));
});

test('número da cartela formatado e erros amigáveis', () => {
  assert.equal(formatCardNumber(42), '0042');
  assert.throws(() => generateCards('', { count: 1 }), /código/);
  assert.throws(() => generateCards(SEED, { count: 0 }), /de 1 a 1000/);
  assert.throws(() => generateCards(SEED, { count: 1001 }), BingoError);
  assert.throws(() => generateCards(SEED, { first: 9999, count: 2 }), /até 9999/);
  assert.throws(() => generateCards(SEED, { first: 0, count: 2 }), /a partir de 1/);
  assert.throws(() => cardAt(SEED, 0), /número da cartela/);
});

function cardWith(columns, freeCenter) {
  return { number: 1, freeCenter, columns };
}

const FULL = cardWith([[1, 2, 3, 4, 5], [16, 17, 18, 19, 20], [31, 32, 33, 34, 35], [46, 47, 48, 49, 50], [61, 62, 63, 64, 65]], false);
const FREE = cardWith([[1, 2, 3, 4, 5], [16, 17, 18, 19, 20], [31, 32, 34, 35], [46, 47, 48, 49, 50], [61, 62, 63, 64, 65]], true);

test('grade: centro livre fica no meio da coluna N', () => {
  assert.deepEqual(cardGrid(FREE)[2], [3, 18, null, 48, 63]);
  assert.deepEqual(cardGrid(FREE).map((row) => row[2]), [31, 32, null, 34, 35]);
  assert.deepEqual(markedGrid(FREE, [])[2], [false, false, true, false, false]);
});

test('padrão linha: horizontal, vertical e diagonais', () => {
  assert.equal(checkPattern(FULL, [1, 16, 31, 46, 61], 'line').ok, true);
  assert.match(checkPattern(FULL, [1, 16, 31, 46, 61], 'line').message, /1ª linha/);
  assert.match(checkPattern(FULL, [16, 17, 18, 19, 20], 'line').message, /coluna I/);
  assert.match(checkPattern(FULL, [1, 17, 33, 49, 65], 'line').message, /diagonal ↘/);
  assert.match(checkPattern(FULL, [5, 19, 33, 47, 61], 'line').message, /diagonal ↙/);
  const almost = checkPattern(FULL, [1, 16, 31, 46], 'line');
  assert.equal(almost.ok, false);
  assert.match(almost.message, /A mais perto tem 4 de 5/);
});

test('padrão linha com centro livre: a casa do meio já vale', () => {
  assert.match(checkPattern(FREE, [3, 18, 48, 63], 'line').message, /3ª linha/);
  assert.match(checkPattern(FREE, [31, 32, 34, 35], 'line').message, /coluna N/);
  assert.match(checkPattern(FREE, [1, 17, 49, 65], 'line').message, /diagonal ↘/);
  assert.equal(checkPattern(FULL, [1, 17, 49, 65], 'line').ok, false, 'sem centro livre faltaria o 33');
  const both = checkPattern(FREE, [3, 18, 48, 63, 1, 17, 49, 65], 'line');
  assert.match(both.message, /3ª linha, diagonal ↘/);
  assert.equal(both.cells.length, 10);
});

test('padrão quatro cantos', () => {
  assert.equal(checkPattern(FULL, [1, 5, 61, 65], 'corners').ok, true);
  assert.equal(checkPattern(FREE, [1, 5, 61, 65], 'corners').ok, true);
  const three = checkPattern(FULL, [1, 5, 61, 33], 'corners');
  assert.equal(three.ok, false);
  assert.equal(three.message, '3 de 4 cantos marcados.');
});

test('padrão cartela cheia', () => {
  assert.equal(checkPattern(FULL, FULL.columns.flat(), 'full').ok, true);
  assert.equal(checkPattern(FREE, FREE.columns.flat(), 'full').ok, true, '24 números bastam com centro livre');
  assert.equal(checkPattern(FULL, FULL.columns.flat().slice(1), 'full').message, 'Falta 1 número para a cartela cheia.');
  assert.equal(checkPattern(FREE, [], 'full').message, 'Faltam 24 números para a cartela cheia.');
  assert.throws(() => checkPattern(FULL, [], 'x'), BingoError);
});

test('números que faltam', () => {
  assert.deepEqual(missingNumbers(FREE, FREE.columns.flat().filter((n) => n !== 34 && n !== 2)), [2, 34]);
});

test('cantador: as 75 pedras saem sem repetir', () => {
  let called = [];
  for (let i = 0; i < TOTAL_BALLS; i += 1) called = drawBall(called).called;
  assert.equal(called.length, 75);
  assert.deepEqual([...called].sort((a, b) => a - b), Array.from({ length: 75 }, (_, i) => i + 1));
  assert.throws(() => drawBall(called), /Todas as 75 pedras/);
  assert.deepEqual(remainingBalls(called), []);
});

test('cantador: determinístico com gerador injetado, desfazer e limpeza', () => {
  const a = drawBall([], seededRandomInt('x'));
  const b = drawBall([], seededRandomInt('x'));
  assert.equal(a.ball, b.ball);
  const { ball, called } = drawBall([10, 20]);
  assert.ok(ball !== 10 && ball !== 20);
  assert.deepEqual(undoLast(called), { ball, called: [10, 20] });
  assert.deepEqual(undoLast([]), { ball: null, called: [] });
  assert.deepEqual(sanitizeCalled([5, 5, 0, 76, 'x', 7.5, 75, 1]), [5, 75, 1]);
  assert.deepEqual(sanitizeCalled('lixo'), []);
  for (let i = 0; i < 1000; i += 1) assert.ok(cryptoRandomInt(75) < 75);
});
