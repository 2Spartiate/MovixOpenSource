import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const module = { exports: {} };
const source = readFileSync(new URL('../src/injection/app-site-overrides.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { module, exports: module.exports });
const script = module.exports.buildAppSiteOverrides();
const ast = ts.createSourceFile('injected.js', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

function apply(name, globals) {
  let declaration;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(declaration, name);
  vm.runInNewContext(`const ${declaration.getText(ast)}; ${name}();`, globals);
}

class Element {
  attrs = new Map();
  styles = new Map();
  style = { setProperty: (k, v) => this.styles.set(k, v) };
  children = [];
  textContent = '';
  setAttribute(k, v) { this.attrs.set(k, v); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
}
class Anchor extends Element {}
class Svg {
  styles = new Map();
  style = { setProperty: (k, v) => this.styles.set(k, v) };
  getAttribute(k) { return k === 'aria-label' ? 'Movix' : null; }
}

test('the current upstream SVG wordmark receives the existing custom logo without replacing React nodes', () => {
  const link = new Anchor();
  link.href = 'https://movix.luxe/';
  link.setAttribute('href', '/');
  const svg = new Svg();
  link.children = [svg];
  link.querySelector = () => svg;
  const children = link.children;
  apply('replaceHeaderLogo', {
    HTMLElement: Element, HTMLAnchorElement: Anchor, SVGElement: Svg, URL,
    normalise: value => String(value || '').trim().toLowerCase(),
    window: { location: { href: link.href } },
    document: { querySelectorAll: () => [link] },
  });
  assert.equal(link.getAttribute('data-movix-app-brand-logo'), '1');
  assert.equal(link.getAttribute('aria-label'), 'Movix');
  assert.equal(link.children, children);
  assert.equal(svg.styles.get('visibility'), 'hidden');
  assert.match(link.styles.get('background-image'), /2Spartiate\/MovixOpenSource/);
});

for (const tv of [true, false]) {
  test(`upstream details-only hero keeps a TV Play entry point, TV=${tv}`, () => {
    const link = new Anchor();
    link.setAttribute('href', '/movie/123');
    link.querySelector = selector => selector.includes('lucide-info') ? {} : null;
    const root = new Element();
    root.querySelectorAll = selector => selector === '[data-tv-primary-focus], [data-tv-autofocus]' ? [] : [link];
    apply('markTvHeroFocusPolicy', {
      HTMLElement: Element, HTMLAnchorElement: Anchor,
      normalise: value => String(value || '').toLowerCase(),
      getTvHeroRoot: () => root, getTvHeroDots: () => [],
      window: { MOVIX_TV: tv },
      document: { documentElement: { lang: 'fr' } },
    });
    assert.equal(link.getAttribute('data-tv-primary-focus'), tv ? 'hero-play' : null);
    assert.equal(link.getAttribute('data-tv-hero-compat-label'), tv ? 'Lire' : null);
    assert.equal(link.getAttribute('href'), '/movie/123');
    assert.equal(link.hasAttribute('data-tv-ignore-focus'), false);
  });
}
