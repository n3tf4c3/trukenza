import assert from 'node:assert/strict';
import { test } from 'node:test';
import { materialSound, roomImpulse, type FoleyKind } from '../src/foley.ts';

for (const rate of [22050, 44100, 48000]) {
  test(`foley em ${rate} Hz: ataques suaves, caudas completas e margem contra saturação`, () => {
    for (const kind of ['papel', 'madeira', 'feijao', 'deslizar'] as FoleyKind[]) {
      for (let variant = 0; variant < 4; variant++) {
        const data = materialSound(kind, rate, variant);
        let peak = 0;
        let energy = 0;
        for (const value of data) {
          assert.ok(Number.isFinite(value));
          peak = Math.max(peak, Math.abs(value));
          energy += value * value;
        }
        assert.ok(peak > 0.07 && peak < 0.8, `${kind}: pico ${peak}`);
        assert.ok(energy / data.length > 0.00001, `${kind} audível`);
        assert.equal(Math.abs(data[0]!), 0);
        assert.equal(Math.abs(data.at(-1)!), 0);
      }
    }
  });
}

test('variações de material são diferentes e reproduzíveis; reflexões estéreo não criam clique', () => {
  const a = materialSound('madeira', 44100, 0);
  assert.deepEqual(a, materialSound('madeira', 44100, 0));
  assert.notDeepEqual(a, materialSound('madeira', 44100, 1));
  const left = roomImpulse(44100, 0);
  const right = roomImpulse(44100, 1);
  assert.notDeepEqual(left, right);
  assert.ok(left.slice(0, 700).every((x) => x === 0));
  assert.ok(Math.abs(left.at(-1)!) < 0.000001);
});
