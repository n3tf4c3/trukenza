import { useStore } from './store';

/**
 * Sons da mesa, todos sintetizados aqui pelo Web Audio (nenhum arquivo baixado, nada de terceiros):
 * cartas, baralho, batidas na mesa, feijões no potinho, avisos da vez e o ambiente do bolicho (fogo e vento).
 * O navegador só deixa tocar depois de um gesto da pessoa: até lá, os pedidos de som são ignorados.
 */

export type Sfx =
  | 'carta'
  | 'embaralhar'
  | 'canto'
  | 'quero'
  | 'nao-quero'
  | 'parda'
  | 'vaza-nossa'
  | 'recolher'
  | 'vez'
  | 'tique'
  | 'tique-final'
  | 'vitoria'
  | 'derrota';

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let ambBus: GainNode;
let white: AudioBuffer;
let brown: AudioBuffer;

/** Volume do ambiente em relação aos efeitos: só um fundo. */
const AMBIENT_LEVEL = 0.32;

function masterLevel(): number {
  const { soundOn, volume } = useStore.getState();
  return soundOn ? volume : 0;
}

function makeNoise(c: AudioContext, seconds: number, brownian: boolean): AudioBuffer {
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brownian) {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = w;
    }
  }
  return buffer;
}

function setup(): void {
  if (ctx) return;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = masterLevel();
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  ambBus = ctx.createGain();
  ambBus.gain.value = 0;
  ambBus.connect(master);
  white = makeNoise(ctx, 2, false);
  brown = makeNoise(ctx, 4, true);
  if (wantAmbient) startAmbient();
}

/** O primeiro toque ou tecla destrava o áudio (regra dos navegadores); depois disso, retoma se o sistema suspender. */
function unlock(): void {
  setup();
  if (ctx?.state === 'suspended') void ctx.resume();
}
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

useStore.subscribe((s, prev) => {
  if (!ctx || (s.soundOn === prev.soundOn && s.volume === prev.volume)) return;
  master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.05);
});

// Com a aba escondida o ambiente se cala; os efeitos (como o aviso da vez) continuam.
document.addEventListener('visibilitychange', () => {
  if (ctx && ambientOn) ambBus.gain.setTargetAtTime(document.hidden ? 0 : AMBIENT_LEVEL, ctx.currentTime, 0.3);
});

// --- Peças básicas -------------------------------------------------------------------------------

interface NoiseOptions {
  type: BiquadFilterType;
  freq: number;
  /** Frequência final do filtro, para varrer (o "vuuush" da carta). */
  toFreq?: number;
  q?: number;
  gain: number;
  attack?: number;
}

function noise(at: number, dur: number, o: NoiseOptions, bus: AudioNode = sfxBus): void {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = white;
  const filter = c.createBiquadFilter();
  filter.type = o.type;
  filter.frequency.setValueAtTime(o.freq, at);
  if (o.toFreq) filter.frequency.exponentialRampToValueAtTime(o.toFreq, at + dur);
  filter.Q.value = o.q ?? 1;
  const g = c.createGain();
  const attack = o.attack ?? 0.002;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(o.gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filter).connect(g).connect(bus);
  src.start(at, Math.random() * 1.5, dur + 0.05);
}

interface ToneOptions {
  type?: OscillatorType;
  gain: number;
  toFreq?: number;
  attack?: number;
  /** Filtro passa-baixa (tira o áspero da onda dente de serra). */
  lowpass?: number;
}

function tone(at: number, freq: number, dur: number, o: ToneOptions): void {
  const c = ctx!;
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, at);
  if (o.toFreq) osc.frequency.exponentialRampToValueAtTime(o.toFreq, at + dur);
  const g = c.createGain();
  const attack = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(o.gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  let out: AudioNode = osc;
  if (o.lowpass) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lowpass;
    out = osc.connect(f);
  }
  out.connect(g).connect(sfxBus);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/** Carta saindo da mão: um sopro curto que sobe. */
function swish(at: number, dur = 0.16, gain = 0.22): void {
  noise(at, dur, { type: 'bandpass', freq: 1400, toFreq: 4200, q: 0.9, gain, attack: dur * 0.4 });
}

/** Carta batendo no tampo de madeira. */
function slap(at: number, gain = 0.5): void {
  noise(at, 0.06, { type: 'bandpass', freq: 2600, q: 0.7, gain });
  tone(at, 150, 0.08, { gain: gain * 0.5, toFreq: 70 });
}

/** Nó dos dedos na mesa. */
function knock(at: number, gain = 0.5): void {
  tone(at, 190, 0.14, { gain, toFreq: 120 });
  noise(at, 0.04, { type: 'bandpass', freq: 900, q: 3, gain: gain * 0.6 });
}

/** Sino curto (avisos e acertos). */
function bell(at: number, freq: number, gain: number, dur = 0.7): void {
  tone(at, freq, dur, { gain, attack: 0.005 });
  tone(at, freq * 2.01, dur * 0.5, { gain: gain * 0.25, attack: 0.005 });
}

/** Um feijão caindo no potinho de barro. */
function bean(at: number): void {
  tone(at, 2200 + Math.random() * 900, 0.035, { type: 'triangle', gain: 0.16 });
  noise(at, 0.02, { type: 'bandpass', freq: 4200, q: 2, gain: 0.12 });
  tone(at, 520 + Math.random() * 60, 0.09, { gain: 0.05 });
}

// --- Efeitos -------------------------------------------------------------------------------------

/** Toca um efeito daqui a `delay` segundos. Sem áudio destravado (ou com o som desligado), não faz nada. */
export function sfx(name: Sfx, delay = 0): void {
  if (!ctx || ctx.state !== 'running' || masterLevel() === 0) return;
  const t = ctx.currentTime + 0.01 + delay;
  switch (name) {
    case 'carta':
      swish(t);
      // Pousa junto com a animação do voo (TableCards: FLY_S = 0,42 s).
      slap(t + 0.36);
      return;
    case 'embaralhar': {
      // Duas metades se misturando, a ponte e as cartas assentando.
      for (let i = 0; i < 26; i++) noise(t + i * 0.024 + Math.random() * 0.008, 0.014, { type: 'bandpass', freq: 3200, q: 1.4, gain: 0.08 + Math.random() * 0.1 });
      swish(t + 0.68, 0.22, 0.16);
      slap(t + 0.92, 0.3);
      return;
    }
    case 'canto':
      knock(t, 0.55);
      knock(t + 0.13, 0.6);
      tone(t + 0.05, 220, 0.38, { type: 'sawtooth', gain: 0.09, toFreq: 330, lowpass: 1400, attack: 0.08 });
      return;
    case 'quero':
      knock(t, 0.45);
      bell(t + 0.05, 659, 0.12, 0.4);
      bell(t + 0.17, 988, 0.12, 0.5);
      return;
    case 'nao-quero':
      knock(t, 0.45);
      tone(t + 0.05, 392, 0.3, { type: 'triangle', gain: 0.1 });
      tone(t + 0.2, 294, 0.4, { type: 'triangle', gain: 0.1 });
      return;
    case 'parda':
      knock(t, 0.3);
      knock(t + 0.18, 0.3);
      return;
    case 'vaza-nossa':
      bell(t, 1319, 0.07, 0.5);
      return;
    case 'recolher':
      noise(t, 0.5, { type: 'lowpass', freq: 3000, toFreq: 600, q: 0.7, gain: 0.18, attack: 0.15 });
      slap(t + 0.5, 0.25);
      return;
    case 'vez':
      bell(t, 659, 0.14);
      bell(t + 0.16, 988, 0.12, 0.9);
      return;
    case 'tique':
      tone(t, 1250, 0.035, { type: 'triangle', gain: 0.14 });
      return;
    case 'tique-final':
      tone(t, 1700, 0.05, { type: 'triangle', gain: 0.2 });
      return;
    case 'vitoria':
      [523, 659, 784, 1047].forEach((f, i) => bell(t + i * 0.13, f, 0.13, i === 3 ? 1.2 : 0.5));
      return;
    case 'derrota':
      [392, 330, 262].forEach((f, i) => tone(t + i * 0.2, f, 0.5, { type: 'triangle', gain: 0.1 }));
      return;
  }
}

/** Cartas indo para cada um na distribuição (três por cadeira). */
export function dealSound(seats: number, delay = 0): void {
  if (!ctx || ctx.state !== 'running' || masterLevel() === 0) return;
  const t = ctx.currentTime + 0.01 + delay;
  for (let i = 0; i < seats * 3; i++) {
    swish(t + i * 0.09, 0.07, 0.12);
    slap(t + i * 0.09 + 0.06, 0.14);
  }
}

/** Feijões no potinho: um por ponto (até oito, para não virar chocalho). */
export function pointsSound(points: number, delay = 0): void {
  if (!ctx || ctx.state !== 'running' || masterLevel() === 0 || points <= 0) return;
  const t = ctx.currentTime + 0.01 + delay;
  for (let i = 0; i < Math.min(points, 8); i++) bean(t + i * 0.1 + Math.random() * 0.02);
}

// --- Ambiente do bolicho ---------------------------------------------------------------------------

let wantAmbient = false;
let ambientOn = false;
let ambientNodes: AudioScheduledSourceNode[] = [];
let crackleTimer: ReturnType<typeof setTimeout> | undefined;

/** Estalos da lenha, em intervalos irregulares. */
function crackle(): void {
  if (!ctx || !ambientOn) return;
  if (ctx.state === 'running' && !document.hidden) {
    const t = ctx.currentTime + 0.02;
    const pops = Math.random() < 0.2 ? 3 : 1;
    for (let i = 0; i < pops; i++) {
      noise(t + i * 0.03 * Math.random(), 0.006 + Math.random() * 0.02, { type: 'highpass', freq: 1500 + Math.random() * 2500, gain: 0.05 + Math.random() * 0.25 }, ambBus);
    }
  }
  crackleTimer = setTimeout(crackle, 40 + Math.random() * 320);
}

/** Liga o fogo e o vento (ao entrar na mesa). Se o áudio ainda não foi destravado, liga assim que for. */
export function startAmbient(): void {
  wantAmbient = true;
  if (!ctx || ambientOn) return;
  ambientOn = true;
  const c = ctx;
  // O fogo: um ronco grave e contínuo.
  const fire = c.createBufferSource();
  fire.buffer = brown;
  fire.loop = true;
  const fireLow = c.createBiquadFilter();
  fireLow.type = 'lowpass';
  fireLow.frequency.value = 420;
  const fireGain = c.createGain();
  fireGain.gain.value = 0.5;
  fire.connect(fireLow).connect(fireGain).connect(ambBus);
  // O vento na janela: um sopro que vai e volta devagar.
  const wind = c.createBufferSource();
  wind.buffer = brown;
  wind.loop = true;
  wind.playbackRate.value = 1.7;
  const windBand = c.createBiquadFilter();
  windBand.type = 'bandpass';
  windBand.frequency.value = 520;
  windBand.Q.value = 0.8;
  const windGain = c.createGain();
  windGain.gain.value = 0.12;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.06;
  const lfoDepth = c.createGain();
  lfoDepth.gain.value = 0.09;
  lfo.connect(lfoDepth).connect(windGain.gain);
  const lfoFreq = c.createGain();
  lfoFreq.gain.value = 180;
  lfo.connect(lfoFreq).connect(windBand.frequency);
  wind.connect(windBand).connect(windGain).connect(ambBus);
  fire.start();
  wind.start(0, 1.3);
  lfo.start();
  ambientNodes = [fire, wind, lfo];
  ambBus.gain.cancelScheduledValues(c.currentTime);
  ambBus.gain.setTargetAtTime(document.hidden ? 0 : AMBIENT_LEVEL, c.currentTime, 0.8);
  crackle();
}

/** Desliga o ambiente (ao sair da mesa), sumindo aos poucos. */
export function stopAmbient(): void {
  wantAmbient = false;
  if (!ctx || !ambientOn) return;
  ambientOn = false;
  clearTimeout(crackleTimer);
  const end = ctx.currentTime + 0.6;
  ambBus.gain.cancelScheduledValues(ctx.currentTime);
  ambBus.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
  for (const n of ambientNodes) n.stop(end);
  ambientNodes = [];
}
