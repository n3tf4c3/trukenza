import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pluckedString } from '../src/music.ts';

function energy(data: Float32Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) sum += data[i]! ** 2;
  return Math.sqrt(sum / (end - start));
}

for (const rate of [22050, 44100, 48000]) {
  test(`cordas em ${rate} Hz: sem clipping, valores inválidos ou cauda abrupta`, () => {
    for (const midi of [40, 43, 45, 47, 48, 52, 54, 55, 57, 59, 60, 62, 63, 64]) {
      const data = pluckedString(midi, rate);
      let peak = 0;
      for (const value of data) {
        assert.ok(Number.isFinite(value));
        peak = Math.max(peak, Math.abs(value));
      }
      assert.ok(peak > 0.05 && peak < 0.85, `nota ${midi}: pico ${peak}`);
      assert.equal(Math.abs(data[0]!), 0);
      assert.ok(Math.abs(data.at(-1)!) < 0.0001);
      assert.ok(energy(data, rate * 2, rate * 2.5) < energy(data, Math.floor(rate * 0.02), Math.floor(rate * 0.2)) * 0.2);
    }
  });
}

test('a afinação da corda acompanha o período da nota e a síntese é reproduzível', () => {
  const rate = 48000;
  for (const midi of [40, 55, 64]) {
    const data = pluckedString(midi, rate);
    assert.deepEqual(data, pluckedString(midi, rate));
    const expected = rate / (440 * 2 ** ((midi - 69) / 12));
    let best = 0;
    let error = Infinity;
    for (let lag = Math.floor(expected * 0.96); lag <= Math.ceil(expected * 1.04); lag++) {
      let sum = 0;
      for (let i = 4800; i < 9600; i++) sum += (data[i]! - data[i + lag]!) ** 2;
      if (sum < error) { best = lag; error = sum; }
    }
    assert.ok(Math.abs(best - expected) / expected < 0.012, `nota ${midi}: período ${best}, esperado ${expected}`);
  }
});

test('a trilha alterna partes, varia o dedilhado e rasga o acorde só com canto em aberto', async () => {
  const { arrangeBar, nextSection, sectionLength } = await import('../src/music.ts');
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const seen = new Set<string>();
  let section: 'tema' | 'ponte' | 'respiro' = 'tema';
  for (let k = 0; k < 12; k++) { seen.add(section); section = nextSection(section, random); }
  assert.ok(seen.has('ponte') && seen.has('respiro'), 'a trilha não fica presa no tema');
  for (const s of ['tema', 'ponte', 'respiro'] as const) {
    for (let bar = 0; bar < sectionLength(s); bar++) for (let variation = 0; variation < 4; variation++) {
      for (const n of arrangeBar(s, bar, variation, 1, random)) {
        assert.ok(n.eighth >= 0 && n.eighth < 6 && n.midi >= 40 && n.midi <= 80 && n.gain > 0 && n.gain <= 0.85, `${s}/${bar}`);
      }
    }
  }
  const calm = arrangeBar('tema', 2, 0, 0, () => 0.9).length;
  assert.ok(arrangeBar('tema', 2, 0, 1, () => 0.9).length >= calm + 8, 'canto em aberto acrescenta o rasgueado');
  assert.notDeepEqual(arrangeBar('tema', 2, 0, 0, () => 0.9).map(n => n.midi), arrangeBar('tema', 2, 1, 0, () => 0.9).map(n => n.midi));
  assert.ok(arrangeBar('respiro', 0, 0, 0, () => 0.9).length <= 2, 'o respiro deixa a mesa quase em silêncio');
});
