import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { CHARACTER_IDS } from '../../../packages/shared/src/characters.ts';
import { VOICE_CAST, VOICE_LINES } from '../src/performance.ts';

const dir = new URL('../public/vozes/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('falas.json', dir), 'utf8')) as {
  version: string; sampleRate: number; characters: Record<string, Record<string, [number, number][]>>;
};

test('cada personagem tem voz própria com todas as falas e variações do catálogo', () => {
  assert.match(manifest.version, /^[0-9a-f]{10}$/);
  for (const id of CHARACTER_IDS) {
    assert.ok(VOICE_CAST[id], `elenco sem ${id}`);
    const file = new URL(`${id}.mp3`, dir);
    assert.ok(existsSync(file), `voz ausente: ${id}`);
    const mp3 = readFileSync(file);
    // ID3 ou quadro MPEG logo no início: é um MP3, não um arquivo trocado.
    assert.ok(mp3.toString('ascii', 0, 3) === 'ID3' || (mp3[0] === 0xff && (mp3[1]! & 0xe0) === 0xe0), `${id}: MP3 inválido`);
    assert.ok(statSync(file).size < 600_000, `${id}: arquivo grande demais para baixar na entrada`);
    const lines = manifest.characters[id]!;
    let previousEnd = 0;
    for (const [call, variants] of Object.entries(VOICE_LINES)) {
      assert.equal(lines[call]?.length, variants.length, `${id}/${call}: variações fora de sincronia com o catálogo`);
      for (const [start, duration] of lines[call]!) {
        // Intervalos de silêncio entre falas absorvem o deslocamento do MP3 (folga de 40 ms antes e 100 ms depois).
        assert.ok(start - previousEnd >= 0.25, `${id}/${call}: falas encostadas`);
        assert.ok(duration > 0.2 && duration < 5, `${id}/${call}: ${duration} s`);
        if (call === 'truco') assert.ok(duration < 2.4, `${id}: grito curto para não prender a resposta`);
        previousEnd = start + duration;
      }
    }
  }
});

test('o murmúrio do bolicho existe e é leve', () => {
  const file = new URL('ambiente-bar.mp3', dir);
  assert.ok(existsSync(file));
  assert.ok(statSync(file).size > 50_000 && statSync(file).size < 400_000);
});
