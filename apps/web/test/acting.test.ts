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

test('ações ociosas, pensar e gole começam e terminam no repouso, sem saltos', async () => {
  const { IDLE_DURATION, GOLE_HELD, idlePose, pickIdle, thinkingPose } = await import('../src/acting.ts');
  for (const kind of Object.keys(IDLE_DURATION) as (keyof typeof IDLE_DURATION)[]) {
    const rest = idlePose(undefined, 0);
    assert.deepEqual(idlePose(kind, 0), rest);
    assert.deepEqual(idlePose(kind, IDLE_DURATION[kind]), rest);
    let previous = rest;
    for (let t = 0; t <= IDLE_DURATION[kind] + 0.1; t += 0.01) {
      const p = idlePose(kind, t);
      for (const k of Object.keys(p) as (keyof typeof p)[]) {
        assert.ok(Number.isFinite(p[k]) && Math.abs(p[k]) < 2, `${kind}/${k}`);
        assert.ok(Math.abs(previous[k] - p[k]) < 0.12, `${kind}/${k} saltou em ${t.toFixed(2)}`);
      }
      previous = p;
    }
  }
  // O copo só passa para a mão quando ela já chegou até ele, e volta antes de soltar.
  assert.equal(idlePose('gole', GOLE_HELD[0]).cup, 1);
  assert.equal(idlePose('gole', GOLE_HELD[1]).cup, 1);
  assert.equal(thinkingPose(0, 3).arm, 0);
  assert.ok(thinkingPose(1, 3).arm > 1);
  for (const c of CHARACTER_IDS) {
    for (let r = 0; r < 1; r += 0.05) assert.notEqual(pickIdle(c, false, r), 'leque', 'sem cartas não arruma o leque');
  }
  assert.equal(pickIdle('gordodofusca', true, 0), 'gole');
});

test('copos ficam no tampo, longe do monte de quem distribui e das vazas guardadas', async () => {
  const { cupPosition, seatAngle, polar } = await import('../src/scene/layout.ts');
  for (const seats of [2, 4]) for (let seat = 0; seat < seats; seat++) {
    const [x, , z] = cupPosition(seatAngle(seat, seats));
    assert.ok(Math.hypot(x, z) + 0.05 < TABLE_RADIUS, 'copo dentro do tampo');
    for (let dealer = 0; dealer < seats; dealer++) {
      const [dx, , dz] = polar(seatAngle(dealer, seats) + 0.72, 1.23);
      assert.ok(Math.hypot(x - dx, z - dz) > 0.18 + 0.05, `copo ${seat} encosta no monte de ${dealer}`);
    }
    for (let view = 0; view < seats; view++) for (const trick of [0, 1, 2]) for (let s = 0; s < seats; s++) {
      // Carta guardada: retângulo de 0,248 × 0,372 m virado para quem vê; o copo tem 5 cm de raio.
      const v = seatAngle(view, seats);
      const [px, , pz] = archivedCardPosition(s, trick, v);
      const across = (x - px) * Math.cos(v) - (z - pz) * Math.sin(v);
      const along = (x - px) * Math.sin(v) + (z - pz) * Math.cos(v);
      assert.ok(Math.abs(across) > 0.124 + 0.05 || Math.abs(along) > 0.186 + 0.05, `copo ${seat} sob a vaza guardada (vista ${view})`);
    }
  }
});
