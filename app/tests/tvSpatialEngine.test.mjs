import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

async function importTypeScript(relativePath) {
  const source = await text(relativePath);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const rect = (left, top, width = 100, height = 100) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
  centerX: left + width / 2,
  centerY: top + height / 2,
});

const candidate = (id, left, top, width, height) => ({
  value: id,
  rect: rect(left, top, width, height),
});
const pick = result => result?.value ?? null;

const { findNextFocusTarget } = await importTypeScript(
  'src/injection/tv-spatial-engine.ts',
);

test('moves right within the same row', () => {
  assert.equal(pick(findNextFocusTarget(
    rect(0, 0),
    [candidate('below', 0, 130), candidate('right', 130, 0)],
    'right',
  )), 'right');
});

test('moves left within the same row', () => {
  assert.equal(pick(findNextFocusTarget(
    rect(130, 0),
    [candidate('left', 0, 0), candidate('below', 130, 130)],
    'left',
  )), 'left');
});

test('moves down to the next row', () => {
  assert.equal(pick(findNextFocusTarget(
    rect(100, 0),
    [candidate('down', 100, 140), candidate('diag', 350, 140)],
    'down',
  )), 'down');
});

test('moves up to the previous row', () => {
  assert.equal(pick(findNextFocusTarget(
    rect(100, 140),
    [candidate('up', 100, 0), candidate('diag', 350, 0)],
    'up',
  )), 'up');
});

test('prefers an aligned target over a diagonal target', () => {
  assert.equal(pick(findNextFocusTarget(
    rect(0, 0),
    [candidate('diag', 115, 150), candidate('aligned', 135, 0)],
    'right',
  )), 'aligned');
});

test('slightly farther but better aligned target wins', () => {
  assert.equal(pick(findNextFocusTarget(
    rect(0, 0),
    [candidate('near-diagonal', 105, 125), candidate('far-aligned', 165, 0)],
    'right',
  )), 'far-aligned');
});

test('excludes candidates behind the requested direction', () => {
  assert.equal(pick(findNextFocusTarget(
    rect(100, 100),
    [candidate('behind', 0, 100), candidate('ahead', 230, 100)],
    'right',
  )), 'ahead');
});

test('ignores invalid zero-size candidates', () => {
  const invalid = {
    value: 'invalid',
    rect: { left: 120, top: 0, right: 120, bottom: 0, width: 0, height: 0 },
  };
  assert.equal(pick(findNextFocusTarget(
    rect(0, 0),
    [invalid, candidate('valid', 180, 0)],
    'right',
  )), 'valid');
});

test('returns null with no candidate', () => {
  assert.equal(findNextFocusTarget(rect(0, 0), [], 'right'), null);
});

test('handles an asymmetric grid', () => {
  assert.equal(pick(findNextFocusTarget(
    rect(160, 0, 80, 120),
    [
      candidate('left-wide', 0, 170, 140, 100),
      candidate('column-match', 155, 190, 70, 90),
      candidate('right', 320, 150, 90, 120),
    ],
    'down',
  )), 'column-match');
});

test('preserves the visual column across multiple rows', () => {
  assert.equal(pick(findNextFocusTarget(
    rect(210, 0, 90, 120),
    [
      candidate('row1-left', 0, 150),
      candidate('row1-column', 205, 150),
      candidate('row2-column', 205, 310),
    ],
    'down',
  )), 'row1-column');
});

test('tie-breaking is deterministic and stable by source order', () => {
  const first = candidate('first', 130, 0);
  const second = candidate('second', 130, 0);
  for (let i = 0; i < 20; i += 1) {
    assert.equal(
      pick(findNextFocusTarget(rect(0, 0), [first, second], 'right')),
      'first',
    );
  }
});
