/**
 * Trilha original do bolicho: três músicas de baile gaúcho em tom maior (vaneira, chamamé e rancheira),
 * com gaita, violão, baixo, chocalho e bumbo sintetizados no navegador. Entre uma música e outra a mesa
 * fica alguns segundos só com o ambiente, para a trilha não cansar. Não baixa amostras; o relógio do
 * áudio agenda as notas, independentemente dos quadros da cena.
 */

export type ChordName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'C7' | 'D7' | 'E7' | 'G7' | 'A7';
export type Groove = 'vaneira' | 'chamame' | 'rancheira';
export type Voice = 'gaita' | 'violao' | 'baixo' | 'chocalho' | 'bumbo';

interface Part { chords: readonly ChordName[]; melody: readonly string[] }
export interface Tune {
  id: string;
  groove: Groove;
  /** Tônica (classe de altura, dó = 0): base das terças da gaita. */
  key: number;
  /** Passos por compasso e duração de cada passo (uma colcheia), em segundos. */
  steps: number;
  step: number;
  a: Part;
  b: Part;
}

/**
 * Melodias em notação compacta: um símbolo por colcheia; `-` prolonga a nota anterior e `.` é pausa.
 * Composições originais, feitas para o jogo.
 */
export const TUNES: readonly Tune[] = [
  {
    id: 'vaneira', groove: 'vaneira', key: 7, steps: 4, step: 0.24,
    a: {
      chords: ['G', 'G', 'D7', 'D7', 'D7', 'D7', 'G', 'G'],
      melody: ['B4 D5 G5 -', 'G5 F#5 G5 B5', 'A5 - F#5 D5', 'C5 D5 F#5 -', 'A4 C5 F#5 -', 'D5 E5 F#5 A5', 'G5 - D5 B4', 'G4 - - .'],
    },
    b: {
      chords: ['C', 'C', 'G', 'G', 'D7', 'D7', 'G', 'G'],
      melody: ['E5 G5 C6 -', 'C6 B5 G5 E5', 'D5 G5 B5 -', 'B5 A5 G5 D5', 'A5 - F#5 D5', 'C6 B5 A5 F#5', 'G5 B5 D6 -', 'G5 - - .'],
    },
  },
  {
    id: 'chamame', groove: 'chamame', key: 2, steps: 6, step: 0.2,
    a: {
      chords: ['D', 'D', 'A7', 'A7', 'A7', 'A7', 'D', 'D'],
      melody: ['F#5 - E5 D5 - F#5', 'A5 - - F#5 - -', 'G5 - F#5 E5 - C#5', 'E5 - - - - .', 'A4 C#5 E5 G5 - F#5', 'E5 - C#5 A4 - -', 'D5 F#5 A5 D6 - C#6', 'D6 - - - . .'],
    },
    b: {
      chords: ['G', 'G', 'D', 'D', 'A7', 'A7', 'D', 'D'],
      melody: ['B5 - A5 G5 - B5', 'D6 - - B5 - -', 'A5 - G5 F#5 - A5', 'F#5 - - - - .', 'E5 F#5 G5 A5 - G5', 'E5 - C#5 E5 - G5', 'F#5 - E5 D5 - -', 'D5 - - - . .'],
    },
  },
  {
    id: 'rancheira', groove: 'rancheira', key: 0, steps: 6, step: 0.185,
    a: {
      chords: ['C', 'C', 'G7', 'G7', 'G7', 'G7', 'C', 'C'],
      melody: ['E5 - G5 - C6 -', 'C6 B5 C6 - G5 -', 'B5 - G5 - F5 -', 'D5 - - - G4 -', 'F5 - A5 - D6 -', 'B5 A5 G5 - F5 -', 'E5 - G5 E5 D5 -', 'C5 - - - . .'],
    },
    b: {
      chords: ['F', 'F', 'C', 'C', 'G7', 'G7', 'C', 'C'],
      melody: ['A5 - C6 - A5 -', 'F5 - A5 - C6 -', 'G5 - E5 - G5 -', 'C6 - - - G5 -', 'B5 - D6 - B5 -', 'G5 F5 D5 - B4 -', 'E5 - G5 - D5 -', 'C5 - - - . .'],
    },
  },
];

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export function parseNote(token: string): number | null {
  const m = /^([A-G])(#|b)?(\d)$/.exec(token);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + LETTERS[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export interface MelodyNote { step: number; midi: number; length: number }

/** Um compasso da melodia; o número de símbolos precisa bater com o compasso. */
export function parseMelody(bar: string, steps: number): MelodyNote[] {
  const tokens = bar.trim().split(/\s+/);
  if (tokens.length !== steps) throw new Error(`compasso com ${tokens.length} colcheias, esperado ${steps}: ${bar}`);
  const notes: MelodyNote[] = [];
  tokens.forEach((token, step) => {
    if (token === '-') { if (notes.length && notes.at(-1)!.step + notes.at(-1)!.length === step) notes.at(-1)!.length++; return; }
    if (token === '.') return;
    const midi = parseNote(token);
    if (midi === null) throw new Error(`nota inválida: ${token}`);
    notes.push({ step, midi, length: 1 });
  });
  return notes;
}

export function chordTones(chord: ChordName): number[] {
  const root = LETTERS[chord[0]!]!;
  return [0, 4, 7, ...(chord.endsWith('7') ? [10] : [])].map(i => (root + i) % 12);
}

/** Primeira nota com essa classe de altura a partir de `low`. */
function from(low: number, pc: number): number {
  return low + (((pc - low) % 12) + 12) % 12;
}

/** Baixo entre mi 2 e ré# 3: tônica ou quinta do acorde. */
export function bassNote(chord: ChordName, fifth = false): number {
  return from(40, (chordTones(chord)[0]! + (fifth ? 7 : 0)) % 12);
}

/** Acorde fechado na região média do violão, sem brigar com o baixo nem com a gaita. */
export function guitarVoicing(chord: ChordName): number[] {
  return chordTones(chord).map(pc => from(55, pc)).sort((a, b) => a - b);
}

/** Terça diatônica abaixo, na tonalidade da música; nota fora da escala não ganha segunda voz. */
export function thirdBelow(midi: number, key: number): number | null {
  const scale = MAJOR.map(i => (key + i) % 12);
  const degree = scale.indexOf(midi % 12);
  if (degree < 0) return null;
  const target = scale[(degree + 5) % 7]!;
  let below = midi - 1;
  while (below % 12 !== target) below--;
  return below;
}

export interface MusicNote { step: number; voice: Voice; midi: number; gain: number; pan: number; length: number; offset: number }

const PAN: Record<Voice, number> = { gaita: 0.14, violao: -0.28, baixo: -0.06, chocalho: 0.36, bumbo: 0 };
const note = (voice: Voice, step: number, midi: number, gain: number, length = 1, offset = 0): MusicNote =>
  ({ step, voice, midi, gain, pan: PAN[voice], length, offset });

/**
 * Acompanhamento de um compasso: baixo, violão e percussão no balanço de cada ritmo. `tension` (0 a 1)
 * vem da mesa: com um canto em aberto o violão rasga o acorde e o bumbo marca mais.
 */
export function grooveBar(groove: Groove, chord: ChordName, bar: number, tension: number): MusicNote[] {
  const notes: MusicNote[] = [];
  const voicing = guitarVoicing(chord);
  const strum = (step: number, gain: number, spread = 0.009) =>
    voicing.forEach((midi, k) => notes.push(note('violao', step, midi, gain * (1 + 0.5 * tension), 1, spread * k)));
  const lift = 1 + 0.4 * tension;
  if (groove === 'vaneira') {
    notes.push(note('baixo', 0, bassNote(chord), 0.8), note('baixo', 2, bassNote(chord, true), 0.6));
    strum(1, 0.28, 0.006);
    strum(3, 0.3, 0.006);
    [0.28, 0.46, 0.3, 0.5].forEach((g, step) => notes.push(note('chocalho', step, 0, g * lift)));
    notes.push(note('bumbo', 0, 0, 0.34));
    if (tension > 0.05) notes.push(note('bumbo', 2, 0, 0.36 * tension));
  } else if (groove === 'chamame') {
    notes.push(note('baixo', 0, bassNote(chord, bar % 2 === 1), 0.8), note('baixo', 3, bassNote(chord, bar % 2 === 0), 0.55));
    strum(2, 0.3);
    strum(4, 0.24);
    [0.4, 0.2, 0.32, 0.36, 0.2, 0.28].forEach((g, step) => notes.push(note('chocalho', step, 0, g * lift)));
    notes.push(note('bumbo', 0, 0, 0.3));
    if (tension > 0.05) notes.push(note('bumbo', 3, 0, 0.32 * tension));
  } else {
    // Rancheira: compasso de três, baixo no primeiro tempo e violão no segundo e no terceiro.
    notes.push(note('baixo', 0, bassNote(chord, bar % 2 === 1), 0.82));
    strum(2, 0.32);
    strum(4, 0.28);
    [0.36, 0, 0.28, 0.16, 0.28, 0.16].forEach((g, step) => g && notes.push(note('chocalho', step, 0, g * lift)));
    notes.push(note('bumbo', 0, 0, 0.3));
  }
  if (tension > 0.05) strum(0, 0.3 * tension, 0.014);
  return notes;
}

export type PartName = 'intro' | 'A' | 'B' | 'fim';
/** Um compasso da forma: parte, número do compasso, quem leva a melodia e se a gaita dobra em terças. */
export interface Cue { part: PartName; bar: number; lead: 'gaita' | 'violao' | null; thirds: boolean }

/** Introdução, A, A em terças, B (às vezes no violão), A e um acorde final. */
export function buildForm(random: () => number): Cue[] {
  const cues: Cue[] = [{ part: 'intro', bar: 0, lead: null, thirds: false }, { part: 'intro', bar: 1, lead: null, thirds: false }];
  const pass = (part: 'A' | 'B', lead: 'gaita' | 'violao', thirds: boolean) => {
    for (let bar = 0; bar < 8; bar++) cues.push({ part, bar, lead, thirds });
  };
  pass('A', 'gaita', false);
  pass('A', 'gaita', true);
  pass('B', random() < 0.35 ? 'violao' : 'gaita', random() < 0.5);
  pass('A', 'gaita', random() < 0.5);
  cues.push({ part: 'fim', bar: 0, lead: null, thirds: false });
  return cues;
}

/** Próxima música, nunca a mesma da anterior. */
export function nextTune(previous: number, random: () => number): number {
  if (previous < 0) return Math.floor(random() * TUNES.length);
  return (previous + 1 + Math.floor(random() * (TUNES.length - 1))) % TUNES.length;
}

/** Tudo o que soa num compasso da forma. */
export function arrangeBar(tune: Tune, cue: Cue, tension: number, random: () => number): MusicNote[] {
  const part = cue.part === 'B' ? tune.b : tune.a;
  if (cue.part === 'fim') {
    const chord = tune.a.chords[0]!;
    const voicing = guitarVoicing(chord);
    return [
      note('baixo', 0, bassNote(chord), 0.85), note('bumbo', 0, 0, 0.45),
      ...voicing.map((midi, k) => note('violao', 0, midi, 0.3, 4, 0.016 * k)),
      note('gaita', 0, from(72, tune.key), 0.34, tune.steps * 2),
      note('gaita', 0, from(64, (tune.key + 4) % 12), 0.2, tune.steps * 2),
    ];
  }
  const chord = cue.part === 'intro' ? part.chords[0]! : part.chords[cue.bar % part.chords.length]!;
  const notes = grooveBar(tune.groove, chord, cue.bar, tension);
  if (!cue.lead) return notes;
  for (const n of parseMelody(part.melody[cue.bar % part.melody.length]!, tune.steps)) {
    // Mão humana: nada cai exatamente na grade nem com a mesma força.
    const offset = random() * 0.012;
    const gain = (cue.lead === 'gaita' ? 0.3 : 0.5) * (0.94 + random() * 0.12);
    notes.push({ ...note(cue.lead === 'gaita' ? 'gaita' : 'violao', n.step, n.midi, gain, n.length, offset), pan: PAN[cue.lead] });
    const low = cue.thirds && cue.lead === 'gaita' ? thirdBelow(n.midi, tune.key) : null;
    if (low !== null) notes.push(note('gaita', n.step, low, gain * 0.6, n.length, offset));
  }
  return notes;
}

/** Harmônicos da palheta da gaita: fundamental forte, pares um pouco mais fracos que os ímpares. */
export function reedHarmonics(count = 14): number[] {
  return Array.from({ length: count }, (_, i) => {
    const k = i + 1;
    return k === 1 ? 1 : (0.72 / k ** 0.95) * (k % 2 ? 1 : 0.78);
  });
}

/** Gaita renderizada fora do navegador (prévia e testes): soma das duas palhetas, cada uma com pico 1 como no navegador. */
export function reedTone(midi: number, duration: number, sampleRate: number): Float32Array<ArrayBuffer> {
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const harmonics = reedHarmonics();
  // O navegador normaliza a onda para pico 1; a prévia faz o mesmo antes do filtro.
  let wavePeak = 0;
  for (let s = 0; s < 2048; s++) {
    let v = 0;
    harmonics.forEach((amp, i) => { v += amp * Math.sin(2 * Math.PI * (i + 1) * s / 2048); });
    wavePeak = Math.max(wavePeak, Math.abs(v));
  }
  const data = new Float32Array(Math.ceil(sampleRate * (duration + 0.09)));
  const cutoff = 2600;
  for (const cents of REED_DETUNE) {
    const f = frequency * 2 ** (cents / 1200);
    harmonics.forEach((amp, i) => {
      const fk = f * (i + 1);
      if (fk > sampleRate / 2.2) return;
      // Filtro passa-baixas suave aplicado por harmônico, como o do navegador.
      const a = amp / wavePeak / Math.sqrt(1 + (fk / cutoff) ** 4);
      const w = 2 * Math.PI * fk / sampleRate;
      for (let s = 0; s < data.length; s++) data[s] = data[s]! + Math.sin(w * s) * a;
    });
  }
  for (let s = 0; s < data.length; s++) {
    const t = s / sampleRate;
    const env = Math.min(1, t / 0.035) * (t < duration ? 1 : Math.max(0, 1 - (t - duration) / 0.09));
    data[s] = data[s]! * env;
  }
  return data;
}
export const REED_DETUNE = [-4, 5] as const;

/** Karplus–Strong: excitação curta seguida de realimentação amortecida da corda. */
export function pluckedString(midi: number, sampleRate: number): Float32Array<ArrayBuffer> {
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const period = Math.round(sampleRate / frequency - 0.5);
  const ring = new Float32Array(period);
  let seed = midi * 7919;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296 * 2 - 1;
  };
  let smooth = 0;
  for (let i = 0; i < period; i++) {
    smooth = smooth * 0.55 + random() * 0.45;
    ring[i] = smooth;
  }
  const data = new Float32Array(Math.ceil(sampleRate * 2.8));
  for (let i = 0; i < data.length; i++) {
    const p = i % period;
    const sample = ring[p]!;
    ring[p] = 0.497 * (sample + ring[(p + 1) % period]!);
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.006);
    const release = Math.min(1, (data.length - i) / (sampleRate * 0.12));
    // A ressonância grave dá corpo; a corda perde brilho naturalmente.
    data[i] = (sample * 0.7 + Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 3) * 0.12) * attack * release;
  }
  return data;
}

/** Chocalho (ruído agudo e curto) e bumbo leguero (batida grave e macia). */
export function percussionSample(kind: 'chocalho' | 'bumbo', sampleRate: number): Float32Array<ArrayBuffer> {
  const duration = kind === 'chocalho' ? 0.09 : 0.36;
  const data = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = kind === 'chocalho' ? 5153 : 811;
  let previous = 0;
  let phase = 0;
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 4294967296 * 2 - 1;
    const t = i / sampleRate;
    const tail = Math.min(1, (data.length - 1 - i) / (sampleRate * 0.015));
    if (kind === 'chocalho') {
      const high = white - previous * 0.92;
      previous = white;
      data[i] = high * Math.min(1, t / 0.004) * Math.exp(-t * 48) * 0.42 * tail;
    } else {
      phase += 2 * Math.PI * (52 + 48 * Math.exp(-t * 28)) / sampleRate;
      data[i] = (Math.sin(phase) * Math.exp(-t * 9) + white * Math.exp(-t * 160) * 0.08) * Math.min(1, t / 0.003) * 0.7 * tail;
    }
  }
  return data;
}

export class BolichoMusic {
  private readonly context: AudioContext;
  private readonly bus: GainNode;
  private readonly room: ConvolverNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly voices = new Set<AudioScheduledSourceNode>();
  private wave: PeriodicWave | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private playing = false;
  private tension = 0;
  private tune = -1;
  private form: Cue[] = [];
  private cue = 0;
  private tempo = 1;
  /** Início do próximo compasso, no relógio do áudio. */
  private next = 0;

  constructor(context: AudioContext, output: AudioNode) {
    this.context = context;
    this.bus = context.createGain();
    this.bus.gain.value = 0;
    // Um pouco de calor: corta o chiado de cima sem abafar a gaita.
    const warmth = context.createBiquadFilter();
    warmth.type = 'lowpass';
    warmth.frequency.value = 7000;
    this.bus.connect(warmth).connect(output);
    this.room = context.createConvolver();
    const impulse = context.createBuffer(2, Math.ceil(context.sampleRate * 0.7), context.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let seed = 183 + ch;
      let smooth = 0;
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        smooth = smooth * 0.45 + (seed / 4294967296 * 2 - 1) * 0.55;
        data[i] = smooth * (1 - i / data.length) ** 3;
      }
    }
    this.room.buffer = impulse;
    const wet = context.createGain();
    wet.gain.value = 0.2;
    this.room.connect(wet).connect(this.bus);
  }

  /** Tensão da mesa (0 a 1): canto em aberto deixa o violão mais rasgado e o bumbo mais presente. */
  setTension(tension: number): void {
    this.tension = Math.max(0, Math.min(1, tension));
  }

  setPlaying(playing: boolean, volume: number): void {
    const c = this.context;
    this.bus.gain.setTargetAtTime(playing ? volume * 0.62 : 0, c.currentTime, playing ? 0.18 : 0.035);
    if (playing === this.playing) return;
    this.playing = playing;
    clearTimeout(this.timer);
    if (playing) {
      this.startTune(c.currentTime + 0.1);
      this.schedule();
    } else {
      for (const voice of this.voices) voice.stop(c.currentTime + 0.2);
      this.voices.clear();
    }
  }

  private startTune(at: number): void {
    this.tune = nextTune(this.tune, Math.random);
    this.form = buildForm(Math.random);
    this.cue = 0;
    // Cada vez a música vem num andamento levemente diferente.
    this.tempo = 0.97 + Math.random() * 0.06;
    this.next = at;
  }

  private sample(key: string, make: () => Float32Array<ArrayBuffer>): AudioBuffer {
    let buffer = this.buffers.get(key);
    if (!buffer) {
      const data = make();
      buffer = this.context.createBuffer(1, data.length, this.context.sampleRate);
      buffer.copyToChannel(data, 0);
      this.buffers.set(key, buffer);
    }
    return buffer;
  }

  private output(pan: number, wet: boolean): StereoPannerNode {
    const stereo = this.context.createStereoPanner();
    stereo.pan.value = pan;
    stereo.connect(this.bus);
    if (wet) stereo.connect(this.room);
    return stereo;
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
  }

  private play(n: MusicNote, at: number, step: number): void {
    const c = this.context;
    if (n.voice === 'gaita') return this.reed(n, at, step);
    const buffer = n.voice === 'chocalho' || n.voice === 'bumbo'
      ? this.sample(n.voice, () => percussionSample(n.voice as 'chocalho' | 'bumbo', c.sampleRate))
      : this.sample(`corda:${n.midi}`, () => pluckedString(n.midi, c.sampleRate));
    const source = c.createBufferSource();
    source.buffer = buffer;
    const level = c.createGain();
    level.gain.value = n.gain;
    const stereo = this.output(n.pan, n.voice !== 'bumbo');
    source.connect(level).connect(stereo);
    this.track(source, [level, stereo]);
    // Corda abafada pela mão no fim do tempo, como no violão de baile.
    const end = at + Math.max(1, n.length) * step * (n.voice === 'violao' ? 1.6 : 2.2);
    if (n.voice === 'violao' || n.voice === 'baixo') {
      level.gain.setValueAtTime(n.gain, end);
      level.gain.setTargetAtTime(0, end, 0.05);
      source.start(at);
      source.stop(end + 0.4);
    } else source.start(at);
  }

  /** Gaita: duas palhetas desafinadas por poucos cents (o batimento da musette), fole com ataque macio. */
  private reed(n: MusicNote, at: number, step: number): void {
    const c = this.context;
    if (!this.wave) {
      const amps = reedHarmonics();
      const real = new Float32Array(amps.length + 1);
      const imag = new Float32Array([0, ...amps]);
      this.wave = c.createPeriodicWave(real, imag);
    }
    const duration = n.length * step * 0.94;
    const frequency = 440 * 2 ** ((n.midi - 69) / 12);
    const tone = c.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    tone.Q.value = 0.6;
    const env = c.createGain();
    const peak = n.gain * 0.5;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + 0.035);
    env.gain.setValueAtTime(peak * 0.92, at + Math.max(0.04, duration));
    env.gain.linearRampToValueAtTime(0, at + duration + 0.09);
    const stereo = this.output(n.pan, true);
    tone.connect(env).connect(stereo);
    REED_DETUNE.forEach((cents, k) => {
      const osc = c.createOscillator();
      osc.setPeriodicWave(this.wave!);
      osc.frequency.value = frequency;
      osc.detune.value = cents;
      osc.connect(tone);
      osc.start(at);
      osc.stop(at + duration + 0.12);
      this.track(osc, k === 0 ? [tone, env, stereo] : []);
    });
  }

  private schedule = (): void => {
    if (!this.playing) return;
    const c = this.context;
    // Ao retomar um dispositivo suspenso, não dispara compassos atrasados em rajada.
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.4) {
      const tune = TUNES[this.tune]!;
      const step = tune.step * (1 - 0.05 * this.tension) / this.tempo;
      const cue = this.form[this.cue]!;
      for (const n of arrangeBar(tune, cue, this.tension, Math.random)) this.play(n, this.next + n.step * step + n.offset, step);
      this.next += tune.steps * step;
      if (++this.cue >= this.form.length) {
        // Fim da música: deixa o acorde soar e a mesa respirar antes da próxima.
        this.startTune(this.next + 6 + Math.random() * 8);
      }
    }
    this.timer = setTimeout(this.schedule, 120);
  };
}
