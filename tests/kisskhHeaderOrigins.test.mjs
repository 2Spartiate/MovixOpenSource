import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const FUNCTIONS = new Set([
  'kisskhHasExactKeys', 'kisskhValidateMediaUrl',
  'kisskhValidateHeaderValue', 'kisskhValidateExchange',
]);
const CONSTANTS = new Set([
  'KISSKH_ALLOWED_HEADER_ORIGIN', 'KISSKH_ALLOWED_HEADER_HOST',
  'KISSKH_MAX_MEDIA_URL_LENGTH', 'KISSKH_MAX_HEADER_VALUE_LENGTH',
  'KISSKH_MAX_EXCHANGE_LIFETIME_MS',
]);

function loadExchangeValidator(file) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declarations = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && CONSTANTS.has(node.name.getText(tree))) {
      declarations.push(`const ${node.getText(tree)};`);
    }
    if (ts.isFunctionDeclaration(node) && FUNCTIONS.has(node.name?.text)) {
      declarations.push(node.getText(tree));
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return vm.runInNewContext(`${declarations.join('\n')}\nkisskhValidateExchange;`, { URL });
}

for (const file of [
  'extension/Chrome/background.js',
  'extension/Firefox/background.js',
  'userscript/movix.user.js',
]) {
  test(`${file}: accepts old, current and future KissKH origins in fallback exchanges`, () => {
    const validate = loadExchangeValidator(file);
    for (const host of ['kisskh.nl', 'kisskh.do', 'kisskh.tv', 'kisskh.com', 'www.kisskh.sh', 'sub.kisskh.do']) {
      const origin = `https://${host}`;
      const requiredHeaders = { Origin: origin, Referer: `${origin}/Drama/4608?episode=3` };
      const result = validate({
        url: 'https://media.example/video.mp4',
        expiresAt: Date.now() + 60_000,
        requiredHeaders,
      });
      assert.ok(result, host);
      assert.equal(result.requiredHeaders.Origin, requiredHeaders.Origin);
      assert.equal(result.requiredHeaders.Referer, requiredHeaders.Referer);
    }
  });

  test(`${file}: rejects unrelated domains and retains header validation`, () => {
    const validate = loadExchangeValidator(file);
    for (const value of [
      'https://example.com', 'https://notkisskh.do', 'https://kisskh.do.attacker.example',
      'https://kisskh-do.example', 'https://127.0.0.1', 'https://localhost',
      'https://example.com/kisskh.do', 'http://kisskh.do', 'https://kisskh.do:8443',
      'https://user:pass@kisskh.do', 'https://kisskh.do#fragment',
      'https://kisskh.do\r\nX-Injected: value', 'https://kisskh.do\0',
    ]) {
      for (const name of ['Origin', 'Referer']) {
        assert.equal(validate({
          url: 'https://media.example/video.mp4',
          expiresAt: Date.now() + 60_000,
          requiredHeaders: { [name]: value },
        }), null, `${name}: ${value}`);
      }
    }
    for (const requiredHeaders of [
      { Origin: 'https://kisskh.do/path' },
      { Origin: 'https://kisskh.do?query=1' },
      { Cookie: 'session=value' },
    ]) {
      assert.equal(validate({
        url: 'https://media.example/video.mp4',
        expiresAt: Date.now() + 60_000,
        requiredHeaders,
      }), null);
    }
  });
}
