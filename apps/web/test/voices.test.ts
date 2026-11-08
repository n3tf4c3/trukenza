import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SPOKEN } from '../src/performance.ts';

test('todas as falas têm áudio local válido, audível e sem saturação', () => {
  for (const call of Object.keys(SPOKEN)) {
    const wav = readFileSync(new URL(`../public/vozes/${call}.wav`, import.meta.url));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt32LE(24), 22050);
    assert.equal(wav.readUInt32LE(40), wav.length - 44);
    const count = (wav.length - 44) / 2;
    assert.ok(count / 22050 > 0.2 && count / 22050 < 5, call);
    // A variação mais grave toca a 0,88x: nem a prévia pode atingir o watchdog de 5,5 s.
    assert.ok(count / 22050 / 0.88 < 5.3, `${call}: cabe na fila mesmo no personagem mais lento`);
    if (call === 'truco') assert.ok(count / 22050 / 0.88 < 2, 'grito curto para não prender a resposta');
    let peak = 0, energy = 0;
    for (let i = 0; i < count; i++) {
      const value = wav.readInt16LE(44 + i * 2) / 32768;
      peak = Math.max(peak, Math.abs(value));
      energy += value * value;
    }
    assert.ok(peak > 0.5 && peak < 0.9, call);
    assert.ok(Math.sqrt(energy / count) > 0.015, `${call}: fala audível`);
    assert.equal(wav.readInt16LE(44), 0);
    assert.equal(wav.readInt16LE(wav.length - 2), 0);
  }
});
