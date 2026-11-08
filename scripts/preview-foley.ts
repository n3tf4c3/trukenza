/** Exporta uma prévia dos timbres usados no jogo: node scripts/preview-foley.ts caminho.wav */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { materialSound } from '../apps/web/src/foley.ts';
import { pluckedString } from '../apps/web/src/music.ts';

const output = process.argv[2];
if (!output || !output.endsWith('.wav')) throw new Error('Informe o caminho de saída .wav');
const rate = 44100;
const track = new Float32Array(rate * 9);
function mix(data: Float32Array, at: number, gain: number) {
  const start = Math.round(at * rate);
  for (let i = 0; i < data.length && start + i < track.length; i++) track[start + i]! += data[i]! * gain;
}
mix(materialSound('papel', rate), 0.3, 0.7);
mix(materialSound('papel', rate, 1), 0.8, 0.55);
mix(materialSound('madeira', rate), 1.6, 0.7);
mix(materialSound('madeira', rate, 1), 1.73, 0.75);
for (let i = 0; i < 4; i++) mix(materialSound('feijao', rate, i), 2.7 + i * 0.13, 0.6);
mix(materialSound('deslizar', rate), 3.7, 0.7);
mix(materialSound('papel', rate, 2), 4.15, 0.4);
for (const [i, midi] of [52, 59, 64, 68, 71, 76].entries()) mix(pluckedString(midi, rate), 5.1 + i * 0.085, 0.8);
const wav = Buffer.alloc(44 + track.length * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(track.length * 2, 40);
let peak = 0;
for (let i = 0; i < track.length; i++) {
  const v = track[i]!;
  peak = Math.max(peak, Math.abs(v));
  if (!Number.isFinite(v) || Math.abs(v) >= 1) throw new Error('Prévia excede a faixa de áudio');
  wav.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
}
writeFileSync(resolve(output), wav);
console.log(`Prévia: ${resolve(output)} | 9 s, 44.1 kHz | pico: ${peak.toFixed(3)}`);
