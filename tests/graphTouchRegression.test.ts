import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceFunction } from './helpers/sourceFunction.mjs';

const bindGuard = () => sourceFunction('src/utils/graphTouch.ts', 'bindSingleNodeTouchDrag');

function surface() {
  const listeners = new Map<string, EventListener>();
  return {
    addEventListener: (type: string, callback: EventListener) => listeners.set(type, callback),
    removeEventListener: (type: string) => listeners.delete(type),
    touch(type: string, points: Array<{ identifier: number; clientX: number; clientY: number }>) {
      let stopped = false;
      listeners.get(type)?.({ touches: points, stopImmediatePropagation() { stopped = true; } } as unknown as Event);
      return stopped;
    },
  };
}

test('un deuxième doigt ne démarre pas un second drag sur le même nœud', () => {
  const canvas = surface();
  bindGuard()(canvas, (x: number) => x < 50);
  const first = { identifier: 1, clientX: 20, clientY: 20 };
  const second = { identifier: 2, clientX: 22, clientY: 20 };
  assert.equal(canvas.touch('touchstart', [first]), false);
  assert.equal(canvas.touch('touchstart', [first, second]), true);
  canvas.touch('touchend', []);
  assert.equal(canvas.touch('touchstart', [second]), false);
});

test('un pincement commencé sur le fond reste disponible et le guard se détache', () => {
  const canvas = surface();
  const cleanup = bindGuard()(canvas, () => false);
  const first = { identifier: 1, clientX: 120, clientY: 20 };
  const second = { identifier: 2, clientX: 122, clientY: 20 };
  assert.equal(canvas.touch('touchstart', [first]), false);
  assert.equal(canvas.touch('touchstart', [first, second]), false);
  cleanup();
  assert.equal(canvas.touch('touchstart', [first, second]), false);
});

test('un geste commencé sur le fond ne peut pas ajouter deux drags du même nœud', () => {
  const canvas = surface();
  bindGuard()(canvas, (x: number) => x < 50);
  const background = { identifier: 1, clientX: 120, clientY: 20 };
  const node = { identifier: 2, clientX: 20, clientY: 20 };
  const sameNode = { identifier: 3, clientX: 22, clientY: 20 };
  assert.equal(canvas.touch('touchstart', [background]), false);
  assert.equal(canvas.touch('touchstart', [background, node]), true);
  assert.equal(canvas.touch('touchstart', [background, node, sameNode]), true);
});
