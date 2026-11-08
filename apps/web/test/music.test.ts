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

test('as três músicas: compassos completos, melodia na região da gaita e assentada no acorde', async () => {
  const { TUNES, chordTones, parseMelody } = await import('../src/music.ts');
  assert.deepEqual(TUNES.map(t => t.groove).sort(), ['chamame', 'rancheira', 'vaneira']);
  for (const tune of TUNES) for (const part of [tune.a, tune.b]) {
    assert.equal(part.chords.length, part.melody.length);
    part.melody.forEach((bar, i) => {
      const notes = parseMelody(bar, tune.steps);
      assert.ok(notes.length > 0, `${tune.id}: compasso ${i + 1} vazio`);
      const strong = tune.steps === 4 ? [0, 2] : tune.groove === 'rancheira' ? [0] : [0, 3];
      for (const n of notes) {
        assert.ok(n.midi >= 64 && n.midi <= 88 && n.step + n.length <= tune.steps, `${tune.id} ${bar}`);
        if (strong.includes(n.step)) assert.ok(chordTones(part.chords[i]!).includes(n.midi % 12), `${tune.id} ${bar}: nota fora do acorde no tempo forte`);
      }
    });
  }
  assert.throws(() => parseMelody('C5 D5 E5', 4));
  assert.throws(() => parseMelody('C5 H5 - -', 4));
  assert.deepEqual(parseMelody('C5 - . G4', 4), [{ step: 0, midi: 72, length: 2 }, { step: 3, midi: 67, length: 1 }]);
});

test('forma com introdução, A em terças, B, volta ao A e final; nunca repete a música seguida', async () => {
  const { TUNES, buildForm, nextTune, thirdBelow } = await import('../src/music.ts');
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const form = buildForm(random);
  assert.deepEqual(form.slice(0, 2).map(c => c.part), ['intro', 'intro']);
  assert.equal(form.at(-1)!.part, 'fim');
  assert.equal(form.filter(c => c.part === 'A').length, 24);
  assert.equal(form.filter(c => c.part === 'B').length, 8);
  assert.ok(form.slice(10, 18).every(c => c.part === 'A' && c.thirds), 'a segunda volta do A vem em terças');
  let tune = nextTune(-1, random);
  const seen = new Set([tune]);
  for (let k = 0; k < 30; k++) {
    const next = nextTune(tune, random);
    assert.notEqual(next, tune);
    seen.add(next);
    tune = next;
  }
  assert.equal(seen.size, TUNES.length);
  assert.equal(thirdBelow(83, 7), 79, 'si sobre sol maior: terça abaixo é sol');
  assert.equal(thirdBelow(78, 2), 74, 'fá# em ré maior: ré');
  assert.equal(thirdBelow(72, 0), 69, 'dó em dó maior: lá');
  assert.equal(thirdBelow(73, 0), null, 'nota fora da escala não ganha segunda voz');
});

test('cada compasso fica na grade e na faixa de cada instrumento; canto em aberto rasga o violão', async () => {
  const { TUNES, arrangeBar, buildForm } = await import('../src/music.ts');
  const random = () => 0.4;
  const range = { gaita: [60, 88], violao: [55, 88], baixo: [40, 51], chocalho: [0, 0], bumbo: [0, 0] } as const;
  for (const tune of TUNES) {
    for (const cue of buildForm(random)) for (const tension of [0, 1]) {
      for (const n of arrangeBar(tune, cue, tension, random)) {
        assert.ok(n.step >= 0 && n.step < tune.steps && n.offset >= 0 && n.offset < 0.06, `${tune.id}/${cue.part}`);
        assert.ok(n.midi >= range[n.voice][0] && n.midi <= range[n.voice][1], `${tune.id}: ${n.voice} ${n.midi}`);
        assert.ok(n.gain > 0 && n.gain <= 1 && n.length >= 1, `${tune.id}: ${n.voice} ganho ${n.gain}`);
      }
    }
    const cue = { part: 'A' as const, bar: 2, lead: 'gaita' as const, thirds: false };
    const calm = arrangeBar(tune, cue, 0, random).filter(n => n.voice === 'violao').length;
    assert.ok(arrangeBar(tune, cue, 1, random).filter(n => n.voice === 'violao').length > calm, `${tune.id}: rasgueado`);
    assert.ok(arrangeBar(tune, { ...cue, thirds: true }, 0, random).filter(n => n.voice === 'gaita').length >
      arrangeBar(tune, cue, 0, random).filter(n => n.voice === 'gaita').length, `${tune.id}: terças`);
    assert.ok(arrangeBar(tune, { part: 'intro', bar: 0, lead: null, thirds: false }, 0, random).every(n => n.voice !== 'gaita'), 'a introdução é só o ritmo');
  }
});

test('gaita e percussão: sem valores inválidos, sem estalo no fim e com a afinação da nota', async () => {
  const { percussionSample, reedHarmonics, reedTone } = await import('../src/music.ts');
  const harmonics = reedHarmonics();
  assert.equal(harmonics[0], 1);
  assert.ok(harmonics.every((a, i) => Number.isFinite(a) && a > 0 && (i === 0 || a < 1)));
  const rate = 44100;
  for (const midi of [64, 76, 88]) {
    const data = reedTone(midi, 0.5, rate);
    let peak = 0;
    for (const v of data) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
    assert.ok(peak > 0.3 && peak <= 2, `gaita ${midi}: pico ${peak}`);
    assert.equal(data[0], 0);
    assert.ok(Math.abs(data.at(-1)!) < 0.01);
    const expected = rate / (440 * 2 ** ((midi - 69) / 12));
    let best = 0;
    let error = Infinity;
    for (let lag = Math.floor(expected * 0.95); lag <= Math.ceil(expected * 1.05); lag++) {
      let sum = 0;
      for (let i = 4410; i < 8820; i++) sum += (data[i]! - data[i + lag]!) ** 2;
      if (sum < error) { best = lag; error = sum; }
    }
    assert.ok(Math.abs(best - expected) / expected < 0.02, `gaita ${midi}: período ${best}, esperado ${expected}`);
  }
  for (const kind of ['chocalho', 'bumbo'] as const) {
    const data = percussionSample(kind, rate);
    let peak = 0;
    for (const v of data) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
    assert.ok(peak > 0.05 && peak < 0.85, `${kind}: pico ${peak}`);
    assert.ok(Math.abs(data.at(-1)!) < 0.001);
  }
});
