/**
 * Exporta uma prévia da trilha do bolicho com as três músicas em sequência:
 *   node scripts/preview-music.ts caminho.wav
 * Usa o mesmo arranjo e os mesmos timbres do jogo (sem a reverberação da sala). O B do chamamé
 * toca com um canto em aberto, para ouvir o rasgueado.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TUNES, arrangeBar, buildForm, percussionSample, pluckedString, reedTone, type Voice } from '../apps/web/src/music.ts';

const output = process.argv[2];
if (!output || !output.endsWith('.wav')) throw new Error('Informe o caminho de saída .wav');
const rate = 44100;
let seed = 11;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const forms = TUNES.map(() => buildForm(random));
const length = forms.reduce((sum, form, i) => sum + form.length * TUNES[i]!.steps * TUNES[i]!.step + 3, 0);
const left = new Float32Array(Math.ceil(rate * (length + 2)));
const right = new Float32Array(left.length);
const energy = new Map<Voice, number>();
const strings = new Map<number, Float32Array>();
const drums = { chocalho: percussionSample('chocalho', rate), bumbo: percussionSample('bumbo', rate) };

function mix(data: Float32Array, at: number, gain: number, pan: number, voice: Voice, damp?: number) {
  const start = Math.round(at * rate);
  const l = Math.cos((pan + 1) * Math.PI / 4) * gain;
  const r = Math.sin((pan + 1) * Math.PI / 4) * gain;
  for (let i = 0; i < data.length && start + i < left.length; i++) {
    const t = i / rate;
    const v = data[i]! * (damp !== undefined && t > damp ? Math.exp(-(t - damp) / 0.05) : 1);
    left[start + i]! += v * l;
    right[start + i]! += v * r;
    energy.set(voice, (energy.get(voice) ?? 0) + (v * gain) ** 2);
  }
}

let clock = 0.3;
TUNES.forEach((tune, index) => {
  for (const cue of forms[index]!) {
    const tension = tune.id === 'chamame' && cue.part === 'B' ? 1 : 0;
    const step = tune.step * (1 - 0.05 * tension);
    for (const n of arrangeBar(tune, cue, tension, random)) {
      const at = clock + n.step * step + n.offset;
      if (n.voice === 'gaita') mix(reedTone(n.midi, n.length * step * 0.94, rate), at, n.gain * 0.5, n.pan, n.voice);
      else if (n.voice === 'chocalho' || n.voice === 'bumbo') mix(drums[n.voice], at, n.gain, n.pan, n.voice);
      else {
        if (!strings.has(n.midi)) strings.set(n.midi, pluckedString(n.midi, rate));
        const damp = Math.max(1, n.length) * step * (n.voice === 'violao' ? 1.6 : 2.2);
        mix(strings.get(n.midi)!, at, n.gain, n.pan, n.voice, damp);
      }
    }
    clock += tune.steps * step;
  }
  clock += 3;
});

const bus = 0.62;
const wav = Buffer.alloc(44 + left.length * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(left.length * 4, 40);
let peak = 0;
for (let i = 0; i < left.length; i++) {
  for (const [k, channel] of [left, right].entries()) {
    const v = channel[i]! * bus;
    peak = Math.max(peak, Math.abs(v));
    if (!Number.isFinite(v) || Math.abs(v) >= 1) throw new Error('Prévia excede a faixa de áudio');
    wav.writeInt16LE(Math.round(v * 32767), 44 + i * 4 + k * 2);
  }
}
writeFileSync(resolve(output), wav);
const levels = [...energy].map(([voice, e]) => `${voice} ${(10 * Math.log10(e * bus * bus / left.length)).toFixed(1)} dB`).join(', ');
console.log(`Prévia: ${resolve(output)} | ${(left.length / rate).toFixed(0)} s, 44.1 kHz | pico: ${peak.toFixed(3)}`);
console.log(`Nível médio por instrumento: ${levels}`);
