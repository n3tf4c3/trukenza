import assert from 'node:assert/strict';
import { test } from 'node:test';
import { characterGesture } from '../src/acting.ts';
import { CHARACTER_IDS } from '../../../packages/shared/src/characters.ts';
import type { GestureKind } from '../src/performance.ts';
import { archivedCardPosition, TABLE_HEIGHT, TABLE_RADIUS, CARD_THICKNESS } from '../src/scene/layout.ts';

test('elenco tem poses distintas, suaves e limitadas, com retorno ao repouso', () => {
  const kinds: GestureKind[] = ['canto', 'quero', 'recusa', 'jogar', 'vaza', 'vitoria', 'derrota'];
  const signatures = new Set(CHARACTER_IDS.map(c => JSON.stringify(characterGesture(c, 'vitoria', 0.6))));
  assert.equal(signatures.size, CHARACTER_IDS.length);
  for (const c of CHARACTER_IDS) for (const kind of kinds) {
    const rest = characterGesture(c, undefined, 0);
    assert.deepEqual(characterGesture(c, kind, -1), rest);
    assert.deepEqual(characterGesture(c, kind, 3), rest);
    let previous = rest;
    for (let t = 0; t <= 2; t += 0.01) {
      const p = characterGesture(c, kind, t);
      for (const k of Object.keys(p) as (keyof typeof p)[]) {
        assert.ok(Number.isFinite(p[k]) && Math.abs(p[k]) < 2, `${c}/${kind}/${k}`);
        assert.ok(Math.abs(previous[k] - p[k]) < 0.25, `${c}/${kind}/${k} saltou`);
      }
      previous = p;
    }
  }
});

test('vazas guardadas ficam apoiadas e dentro da mesa em qualquer cadeira', () => {
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) for (const trick of [0, 1]) {
    for (let seat = 0; seat < 4; seat++) {
      const [x, y, z] = archivedCardPosition(seat, trick, a);
      assert.ok(y > TABLE_HEIGHT);
      if (seat) assert.ok(y - archivedCardPosition(seat - 1, trick, a)[1] > CARD_THICKNESS);
      for (const dx of [-0.4 * 0.62 / 2, 0.4 * 0.62 / 2]) for (const dz of [-0.6 * 0.62 / 2, 0.6 * 0.62 / 2]) {
        const cx = x + dx * Math.cos(a) + dz * Math.sin(a);
        const cz = z - dx * Math.sin(a) + dz * Math.cos(a);
        assert.ok(Math.hypot(cx, cz) < TABLE_RADIUS);
      }
    }
  }
});
