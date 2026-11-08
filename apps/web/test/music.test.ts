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
