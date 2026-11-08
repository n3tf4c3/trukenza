import { readFileSync, writeFileSync } from 'node:fs';
import { SPOKEN } from '../apps/web/src/performance.ts';

// Apenas os WAV gerados pelo script irmão, nunca caminhos arbitrários.
for (const key of Object.keys(SPOKEN)) {
  const path = new URL(`../apps/web/public/vozes/${key}.wav`, import.meta.url);
  const wav = readFileSync(path);
  let start = 0, bytes = 0;
  for (let at = 12; at + 8 <= wav.length;) {
    const size = wav.readUInt32LE(at + 4);
    if (wav.toString('ascii', at, at + 4) === 'data') { start = at + 8; bytes = size; break; }
    at += 8 + size + size % 2;
  }
  if (!start || bytes < 1000) throw Error(`Áudio inválido: ${key}`);
  const samples = Array.from({ length: bytes / 2 }, (_, i) => wav.readInt16LE(start + i * 2));
  const peak = samples.reduce((p, x) => Math.max(p, Math.abs(x)), 0);
  if (peak < 500) throw Error(`Voz silenciosa: ${key}`);
  const first = Math.max(0, samples.findIndex(x => Math.abs(x) > 250) - 440);
  const last = Math.min(samples.length, samples.findLastIndex(x => Math.abs(x) > 250) + 1100);
  const challenge = ['truco', 'retruco', 'vale-quatro', 'previa'].includes(key);
  // Compressão suave antes da normalização: mais corpo no grito, sem elevar o pico.
  // Entrada: WAVs crus recém-gerados por generate-voices.ps1.
  const speech = samples.slice(first, last);
  // SAPI acrescenta pausas de frase que enfraquecem o desafio e atrasam a próxima resposta.
  // Encurta só silêncio contínuo > 180 ms; preserva 90 ms e as bordas originais da fala.
  const tight: number[] = [];
  for (let i = 0; i < speech.length;) {
    if (!challenge || Math.abs(speech[i]!) >= 180) { tight.push(speech[i++]!); continue; }
    let end = i;
    while (end < speech.length && Math.abs(speech[end]!) < 180) end++;
    if (end - i > 3969) {
      tight.push(...speech.slice(i, i + 992), ...speech.slice(end - 992, end));
    } else tight.push(...speech.slice(i, end));
    i = end;
  }
  const trimmed = tight.map(x => challenge ? Math.tanh(x / peak * 1.7) : x);
  const processedPeak = trimmed.reduce((p, x) => Math.max(p, Math.abs(x)), 0);
  const out = Buffer.alloc(44 + trimmed.length * 2);
  out.write('RIFF', 0); out.writeUInt32LE(out.length - 8, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(22050, 24); out.writeUInt32LE(44100, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(trimmed.length * 2, 40);
  trimmed.forEach((x, i) => out.writeInt16LE(Math.round(x * (0.85 * 32767 / processedPeak) * Math.min(1, i / 110, (trimmed.length - 1 - i) / 110)), 44 + i * 2));
  writeFileSync(path, out);
  console.log(`${key}: ${(trimmed.length / 22050).toFixed(2)} s`);
}
