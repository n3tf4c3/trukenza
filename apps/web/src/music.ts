/** Trilha original em 6/8: violão dedilhado e baixo, sintetizados por cordas amortecidas.
 * Não baixa amostras. O relógio do áudio agenda notas, independentemente dos quadros da cena.
 */
const EIGHTH = 60 / 84 / 2;
const HARMONY = [
  [40, 52, 55, 59], [40, 52, 55, 59], [48, 55, 60, 64], [48, 55, 60, 64],
  [43, 55, 59, 62], [43, 55, 59, 62], [47, 54, 59, 63], [47, 54, 57, 63],
  [45, 57, 60, 64], [45, 57, 60, 64], [40, 55, 59, 64], [48, 55, 60, 64],
  [43, 55, 59, 62], [47, 54, 57, 63], [40, 55, 59, 64], [40, 52, 55, 59],
] as const;

/** Segunda parte, em sol maior: abre a sonoridade antes de voltar ao tema em mi menor. */
const BRIDGE = [
  [48, 55, 60, 64], [48, 55, 60, 64], [43, 55, 59, 62], [43, 55, 59, 62],
  [45, 57, 60, 64], [45, 57, 60, 64], [47, 54, 57, 63], [47, 54, 57, 63],
] as const;

/** Dedilhados (índices do acorde, uma colcheia cada): a mesma harmonia muda de cara a cada volta. */
const PATTERNS = [[0, 1, 2, 3, 2, 1], [0, 2, 3, 1, 3, 2], [0, 3, 2, 3, 1, 3], [0, 1, 3, 2, 3, 1]] as const;

export type Section = 'tema' | 'ponte' | 'respiro';
export interface MusicNote { eighth: number; midi: number; gain: number; pan: number; offset: number }

/** Próxima parte da trilha: o tema volta sempre, a ponte e o respiro se alternam entre as voltas. */
export function nextSection(previous: Section, random: () => number): Section {
  if (previous !== 'tema') return 'tema';
  return random() < 0.55 ? 'ponte' : 'respiro';
}

export function sectionLength(section: Section): number {
  return section === 'tema' ? HARMONY.length : section === 'ponte' ? BRIDGE.length * 2 : 8;
}

/**
 * Notas de um compasso de 6/8. `tension` (0 a 1) vem da mesa: com um canto em aberto, o violão rasga
 * o acorde nos tempos fortes. O respiro deixa só o baixo e uma nota aguda, para a trilha não cansar.
 */
export function arrangeBar(section: Section, bar: number, variation: number, tension: number, random: () => number): MusicNote[] {
  const chord = section === 'ponte' ? BRIDGE[bar % BRIDGE.length]! : HARMONY[bar % HARMONY.length]!;
  const last = bar === sectionLength(section) - 1;
  const notes: MusicNote[] = [];
  if (section === 'respiro') {
    notes.push({ eighth: 0, midi: chord[0]!, gain: 0.7, pan: -0.12, offset: 0 });
    if (bar % 2 === 0) notes.push({ eighth: 3, midi: chord[3]! + 12, gain: 0.32, pan: 0.3, offset: 0 });
    return notes;
  }
  const pattern = PATTERNS[(variation + (bar % 2)) % PATTERNS.length]!;
  for (let beat = 0; beat < 6; beat++) {
    // Uma respiração no fim da frase evita o efeito de metrônomo interminável.
    if (last && beat > 2) break;
    notes.push({ eighth: beat, midi: chord[pattern[beat]!]!, gain: beat === 0 ? 0.85 : 0.57 + (beat % 3) * 0.06, pan: beat === 0 ? -0.12 : 0.18, offset: 0 });
    if (beat === 3 && bar % 2 === 0) notes.push({ eighth: beat, midi: chord[0]!, gain: 0.4, pan: -0.12, offset: 0.018 });
  }
  // Uma frase curta lá em cima, de vez em quando.
  if (!last && random() < 0.3) {
    const top = chord[3]! + 12;
    notes.push({ eighth: 2, midi: top, gain: 0.38, pan: 0.32, offset: 0 }, { eighth: 4, midi: chord[2]! + 12, gain: 0.3, pan: 0.32, offset: 0 });
  }
  if (tension > 0.05) {
    for (const beat of [0, 3]) chord.forEach((midi, k) => notes.push({ eighth: beat, midi, gain: 0.32 * tension, pan: 0.05, offset: 0.012 * k }));
  }
  return notes;
}

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

export class BolichoMusic {
  private readonly context: AudioContext;
  private readonly bus: GainNode;
  private readonly room: ConvolverNode;
  private readonly buffers = new Map<number, AudioBuffer>();
  private readonly voices = new Set<AudioBufferSourceNode>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private playing = false;
  private step = 0;
  private next = 0;
  private section: Section = 'tema';
  private variation = 0;
  private tension = 0;

  constructor(context: AudioContext, output: AudioNode) {
    this.context = context;
    this.bus = context.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(output);
    this.room = context.createConvolver();
    const impulse = context.createBuffer(2, Math.ceil(context.sampleRate * 0.65), context.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let seed = 183 + ch;
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[i] = (seed / 4294967296 * 2 - 1) * (1 - i / data.length) ** 3;
      }
    }
    this.room.buffer = impulse;
    const wet = context.createGain();
    wet.gain.value = 0.16;
    this.room.connect(wet).connect(this.bus);
  }

  /** Tensão da mesa (0 a 1): canto em aberto deixa o violão mais rasgado e um pouco mais rápido. */
  setTension(tension: number): void {
    this.tension = Math.max(0, Math.min(1, tension));
  }

  setPlaying(playing: boolean, volume: number): void {
    const c = this.context;
    this.bus.gain.setTargetAtTime(playing ? volume * 0.65 : 0, c.currentTime, playing ? 0.18 : 0.035);
    if (playing === this.playing) return;
    this.playing = playing;
    clearTimeout(this.timer);
    if (playing) {
      this.next = c.currentTime + 0.08;
      this.schedule();
    } else {
      for (const voice of this.voices) voice.stop(c.currentTime + 0.2);
      this.voices.clear();
      this.step = 0;
      this.section = 'tema';
    }
  }

  private note(midi: number, at: number, gain: number, pan: number): void {
    const c = this.context;
    let buffer = this.buffers.get(midi);
    if (!buffer) {
      const data = pluckedString(midi, c.sampleRate);
      buffer = c.createBuffer(1, data.length, c.sampleRate);
      buffer.copyToChannel(data, 0);
      this.buffers.set(midi, buffer);
    }
    const source = c.createBufferSource();
    source.buffer = buffer;
    const level = c.createGain();
    level.gain.value = gain;
    const stereo = c.createStereoPanner();
    stereo.pan.value = pan;
    source.connect(level).connect(stereo);
    stereo.connect(this.bus);
    stereo.connect(this.room);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      level.disconnect();
      stereo.disconnect();
    };
    source.start(at);
  }

  private schedule = (): void => {
    if (!this.playing) return;
    const c = this.context;
    // Ao retomar um dispositivo suspenso, não dispara notas atrasadas em rajada.
    if (this.next < c.currentTime) this.next = c.currentTime + 0.04;
    while (this.next < c.currentTime + 0.3) {
      // Um compasso por vez: as notas ficam agendadas no relógio do áudio.
      const bar = Math.floor(this.step / 6);
      const eighth = EIGHTH * (1 - 0.06 * this.tension);
      if (this.step % 6 === 0) {
        for (const n of arrangeBar(this.section, bar, this.variation, this.tension, Math.random)) {
          this.note(n.midi, this.next + n.eighth * eighth + n.offset, n.gain, n.pan);
        }
      }
      this.next += eighth;
      this.step++;
      if (this.step >= sectionLength(this.section) * 6) {
        this.step = 0;
        this.section = nextSection(this.section, Math.random);
        if (this.section === 'tema') this.variation = (this.variation + 1 + Math.floor(Math.random() * 2)) % PATTERNS.length;
      }
    }
    this.timer = setTimeout(this.schedule, 100);
  };
}
