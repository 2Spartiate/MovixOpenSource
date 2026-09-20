import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceFunction } from './helpers/sourceFunction.mjs';

test('la disparition du document déclenche la récupération au lieu de cascades de crashs DOM', () => {
  const isRecoverable = sourceFunction('src/utils/errorTracking.ts', 'isRecoverableError', {
    isChunkLoadError: () => false, document: { body: null },
  });
  assert.equal(isRecoverable(new TypeError('Cannot read properties of null'), true), true);
});

test('une erreur globale sur document détaché reste visible faute de récupération React', () => {
  const isRecoverable = sourceFunction('src/utils/errorTracking.ts', 'isRecoverableError', {
    isChunkLoadError: () => false, document: { body: null },
  });
  assert.equal(isRecoverable(new TypeError('Cannot read properties of null')), false);
});

test('un document intact conserve les vraies erreurs de code', () => {
  const isRecoverable = sourceFunction('src/utils/errorTracking.ts', 'isRecoverableError', {
    isChunkLoadError: () => false, document: { body: {} },
  });
  assert.equal(isRecoverable(new TypeError('Cannot read properties of null')), false);
});

test('seules les signatures injectées connues et automatiques sont exclues', () => {
  const isInjected = sourceFunction('src/utils/errorTracking.ts', 'isInjectedBrowserError');
  const event = (value: string, handled = false) => ({ exception: { values: [{ value, mechanism: { handled } }] } });
  for (const message of ["undefined is not an object (evaluating 'this.blobUrls[0].start')", "Can't find variable: logMutedMessage", "Can't create duplicate variable: 'MinHeightToDisplayTitle'", "undefined is not an object (evaluating 'window.webkit.messageHandlers')"]) {
    assert.equal(isInjected(event(message)), true, message);
    assert.equal(isInjected(event(message, true)), false, 'les captures explicites restent visibles');
  }
  assert.equal(isInjected(event("Can't find variable: msg")), false, 'une variable générique ne prouve pas une injection');
  assert.equal(isInjected(event('Cannot read properties of null')), false);
});
