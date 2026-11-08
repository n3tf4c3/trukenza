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
      const bar = Math.floor(this.step / 6) % HARMONY.length;
      const beat = this.step % 6;
      const chord = HARMONY[bar]!;
      const pattern = bar % 2 ? [0, 2, 3, 1, 3, 2] : [0, 1, 2, 3, 2, 1];
      // Uma respiração no fim da frase evita o efeito de metrônomo interminável.
      if (!(bar === 15 && beat > 2)) {
        this.note(chord[pattern[beat]!]!, this.next, beat === 0 ? 0.85 : 0.57 + (beat % 3) * 0.06, beat === 0 ? -0.12 : 0.18);
        if (beat === 3 && bar % 2 === 0) this.note(chord[0]!, this.next + 0.018, 0.4, -0.12);
      }
      this.next += EIGHTH;
      this.step = (this.step + 1) % (HARMONY.length * 6);
    }
    this.timer = setTimeout(this.schedule, 100);
  };
}
