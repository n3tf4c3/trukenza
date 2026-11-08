import { useStore } from './store';
import type { SceneryId } from '@trukenza/shared';
import { BolichoMusic, pluckedString } from './music';
import { materialSound, roomImpulse, type FoleyKind } from './foley';

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
let music: BolichoMusic;
const materialBuffers = new Map<string, AudioBuffer>();
const noteBuffers = new Map<number, AudioBuffer>();
let room: ConvolverNode;
let variation = 0;

function syncMusic(): void {
  if (!ctx) return;
  const s = useStore.getState();
  music.setPlaying(wantAmbient && !document.hidden && s.soundOn && s.volume > 0 && s.musicOn && s.musicVolume > 0, s.musicVolume * (s.speaking ? 0.25 : 1));
}

/** Volume do ambiente em relação aos efeitos: só um fundo. */
const AMBIENT_LEVEL = 0.19;

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
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.2;
  master.connect(compressor).connect(ctx.destination);
  music = new BolichoMusic(ctx, master);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  room = ctx.createConvolver();
  const impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * 0.32), ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) impulse.copyToChannel(roomImpulse(ctx.sampleRate, ch), ch);
  room.buffer = impulse;
  const wet = ctx.createGain();
  wet.gain.value = 0.12;
  sfxBus.connect(room).connect(wet).connect(master);
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
window.addEventListener('click', unlock, true);

/** Índice das falas locais (gerado por scripts/generate-voices.ps1): início e duração de cada variação. */
interface VoiceManifest { version: string; characters: Record<string, Record<string, [number, number][]>> }
let manifest: Promise<VoiceManifest> | null = null;
const voiceSprites = new Map<string, Promise<AudioBuffer>>();

function loadManifest(): Promise<VoiceManifest> {
  if (!manifest) {
    manifest = fetch('/vozes/falas.json', { cache: 'no-cache' }).then(async response => {
      if (!response.ok) throw Error('Falas indisponíveis');
      return (await response.json()) as VoiceManifest;
    });
    void manifest.catch(() => { manifest = null; });
  }
  return manifest;
}

/** Um arquivo por personagem com todas as falas dele: só baixa quem está na mesa. */
function loadSprite(character: string, context: AudioContext): Promise<AudioBuffer> {
  let sprite = voiceSprites.get(character);
  if (!sprite) {
    sprite = loadManifest().then(async m => {
      const response = await fetch(`/vozes/${character}.mp3?v=${encodeURIComponent(m.version)}`);
      if (!response.ok) throw Error('Voz indisponível');
      return context.decodeAudioData(await response.arrayBuffer());
    });
    voiceSprites.set(character, sprite);
    void sprite.catch(() => voiceSprites.delete(character));
  }
  return sprite;
}

/** Entrada na mesa: baixa e decodifica as vozes dos personagens presentes antes do primeiro canto. */
export function prepareVoices(characters: string[]): void {
  setup();
  if (!ctx) return;
  for (const c of new Set(characters)) if (/^[a-z]+$/.test(c)) void loadSprite(c, ctx).catch(() => {});
}

/** Falas próprias pré-sintetizadas: mesmo volume geral, sem depender do motor de voz do navegador. */
export function playVoiceLine(character: string, key: string, variant: number, rate: number, volume: number,
  started: () => void, ended: (failed?: boolean) => void): () => void {
  setup();
  const context = ctx;
  let canceled = false;
  let source: AudioBufferSourceNode | null = null;
  let gain: GainNode | null = null;
  if (!context || !/^[a-z]+$/.test(character) || !/^[a-z-]+$/.test(key)) { ended(true); return () => {}; }
  void Promise.all([loadManifest(), loadSprite(character, context), context.resume()]).then(([m, decoded]) => {
    if (canceled) return;
    const slot = m.characters[character]?.[key]?.[variant] ?? m.characters[character]?.[key]?.[0];
    if (context.state !== 'running' || !slot) { ended(true); return; }
    source = context.createBufferSource();
    source.buffer = decoded;
    source.playbackRate.value = rate;
    gain = context.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(master);
    source.onended = () => {
      source?.disconnect(); gain?.disconnect();
      if (!canceled) ended();
    };
    // Folga nas bordas: o MP3 desloca alguns milissegundos e os intervalos entre falas são silêncio.
    const [at, duration] = slot;
    source.start(0, Math.max(0, at - 0.04), duration + 0.1);
    started();
  }).catch(() => { if (!canceled) ended(true); });
  return () => { canceled = true; source?.stop(); source?.disconnect(); gain?.disconnect(); };
}

/** Tensão pública da mão: canto esperando resposta pesa mais; Truco já valendo mais pesa um pouco. */
function tableTension(game: ReturnType<typeof useStore.getState>['game']): number {
  const h = game?.hand;
  if (!h || h.ended || game.winner !== null) return 0;
  if (h.truco.pending || h.envido.pending || h.flor.pending) return 1;
  return h.truco.level >= 3 ? 0.45 : h.truco.level === 2 ? 0.2 : 0;
}

useStore.subscribe((s, prev) => {
  if (!ctx) return;
  if (s.game !== prev.game) music.setTension(tableTension(s.game));
  if (s.musicOn !== prev.musicOn || s.musicVolume !== prev.musicVolume || s.soundOn !== prev.soundOn || s.volume !== prev.volume || s.speaking !== prev.speaking) syncMusic();
  if (s.speaking !== prev.speaking) sfxBus.gain.setTargetAtTime(s.speaking ? 0.55 : 1, ctx.currentTime, 0.06);
  if (s.soundOn === prev.soundOn && s.volume === prev.volume) return;
  master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.05);
});

// Com a aba escondida o ambiente se cala; os efeitos (como o aviso da vez) continuam.
document.addEventListener('visibilitychange', () => {
  if (ctx && ambientOn) ambBus.gain.setTargetAtTime(document.hidden ? 0 : AMBIENT_LEVEL, ctx.currentTime, 0.3);
  syncMusic();
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
  src.onended = () => { src.disconnect(); filter.disconnect(); g.disconnect(); };
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

function tone(at: number, freq: number, dur: number, o: ToneOptions, bus: AudioNode = sfxBus): void {
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
  let filter: BiquadFilterNode | undefined;
  if (o.lowpass) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lowpass;
    filter = f;
    out = osc.connect(f);
  }
  out.connect(g).connect(bus);
  osc.start(at);
  osc.stop(at + dur + 0.05);
  osc.onended = () => { osc.disconnect(); filter?.disconnect(); g.disconnect(); };
}

function sample(at: number, buffer: AudioBuffer, gain: number, pan = 0): void {
  const c = ctx!;
  const source = c.createBufferSource();
  source.buffer = buffer;
  const level = c.createGain();
  level.gain.value = gain;
  const stereo = c.createStereoPanner();
  stereo.pan.value = pan;
  source.connect(level).connect(stereo).connect(sfxBus);
  source.onended = () => { source.disconnect(); level.disconnect(); stereo.disconnect(); };
  source.start(at);
}

function foley(kind: FoleyKind, at: number, gain: number): void {
  const v = variation++ % 4;
  const key = `${kind}:${v}`;
  let buffer = materialBuffers.get(key);
  if (!buffer) {
    const data = materialSound(kind, ctx!.sampleRate, v);
    buffer = ctx!.createBuffer(1, data.length, ctx!.sampleRate);
    buffer.copyToChannel(data, 0);
    materialBuffers.set(key, buffer);
  }
  sample(at, buffer, gain, (v - 1.5) * 0.045);
}

/** Pequenas respostas de violão combinam com a trilha e não soam como alarmes. */
function pluck(at: number, midi: number, gain: number): void {
  let buffer = noteBuffers.get(midi);
  if (!buffer) {
    const data = pluckedString(midi, ctx!.sampleRate);
    buffer = ctx!.createBuffer(1, data.length, ctx!.sampleRate);
    buffer.copyToChannel(data, 0);
    noteBuffers.set(midi, buffer);
  }
  sample(at, buffer, gain);
}

/** Carta saindo da mão: um sopro curto que sobe. */
function swish(at: number, dur = 0.16, gain = 0.22): void {
  noise(at, dur, { type: 'bandpass', freq: 1400, toFreq: 4200, q: 0.9, gain, attack: dur * 0.4 });
}

/** Carta batendo no tampo de madeira. */
function slap(at: number, gain = 0.5): void {
  foley('papel', at, gain * 1.1);
}

/** Nó dos dedos na mesa. */
function knock(at: number, gain = 0.5): void {
  foley('madeira', at, gain);
}

/** Sino curto (avisos e acertos). */
function bell(at: number, freq: number, gain: number, dur = 0.7): void {
  tone(at, freq, dur, { gain, attack: 0.005 });
  tone(at, freq * 2.01, dur * 0.5, { gain: gain * 0.25, attack: 0.005 });
}

/** Um feijão caindo no potinho de barro. */
function bean(at: number): void {
  foley('feijao', at, 0.35);
}

// --- Efeitos -------------------------------------------------------------------------------------

/** Toca um efeito daqui a `delay` segundos. Sem áudio destravado (ou com o som desligado), não faz nada. */
export function sfx(name: Sfx, delay = 0): void {
  if (!ctx || ctx.state !== 'running' || masterLevel() === 0) return;
  const t = ctx.currentTime + 0.01 + delay;
  switch (name) {
    case 'carta':
      swish(t, 0.18, 0.095);
      // Pousa junto com a animação do voo (TableCards: FLY_S = 0,42 s).
      slap(t + 0.42);
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
      [52, 59, 64].forEach((n, i) => pluck(t + 0.05 + i * 0.025, n, 0.32));
      return;
    case 'quero':
      knock(t, 0.45);
      pluck(t + 0.04, 64, 0.5);
      pluck(t + 0.16, 71, 0.42);
      return;
    case 'nao-quero':
      knock(t, 0.45);
      pluck(t + 0.04, 59, 0.45);
      pluck(t + 0.18, 52, 0.4);
      return;
    case 'parda':
      knock(t, 0.3);
      knock(t + 0.18, 0.3);
      return;
    case 'vaza-nossa':
      pluck(t, 76, 0.4);
      return;
    case 'recolher':
      foley('deslizar', t, 0.55);
      slap(t + 0.5, 0.25);
      return;
    case 'vez':
      bell(t, 660, 0.065, 0.45);
      pluck(t + 0.13, 71, 0.48);
      return;
    case 'tique':
      foley('feijao', t, 0.13);
      return;
    case 'tique-final':
      foley('feijao', t, 0.23);
      tone(t, 880, 0.065, { gain: 0.045 });
      return;
    case 'vitoria':
      [52, 59, 64, 68, 71, 76].forEach((n, i) => pluck(t + i * 0.085, n, 0.6));
      return;
    case 'derrota':
      [59, 55, 52].forEach((n, i) => pluck(t + i * 0.22, n, 0.45));
      return;
  }
}

/** Sons dos gestos ociosos (mesa viva): o copo sai e volta à mesa, a cadeira range, o leque farfalha. */
export function idleSound(kind: 'gole' | 'leque' | 'cocar' | 'recostar', distance = 1): void {
  if (!ctx || ctx.state !== 'running' || masterLevel() === 0 || document.hidden) return;
  const t = ctx.currentTime + 0.01;
  const g = Math.max(0.25, Math.min(1, 1.6 / Math.max(0.5, distance)));
  switch (kind) {
    case 'gole':
      foley('copo', t + 0.4, 0.22 * g);
      foley('copo', t + 2.05, 0.4 * g);
      return;
    case 'recostar':
      foley('rangido', t + 0.1, 0.35 * g);
      return;
    case 'leque':
      swish(t + 0.15, 0.09, 0.05 * g);
      swish(t + 0.45, 0.08, 0.04 * g);
      return;
    case 'cocar':
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
let ambientScenery: SceneryId = 'bolicho';
let ambientOn = false;
let ambientNodes: AudioScheduledSourceNode[] = [];
let crackleTimer: ReturnType<typeof setTimeout> | undefined;
let clinkTimer: ReturnType<typeof setTimeout> | undefined;
let murmur: Promise<AudioBuffer> | null = null;

/** Burburinho de outros fregueses: só onde faz sentido gente em volta. */
const MURMUR_LEVEL: Partial<Record<SceneryId, number>> = { bolicho: 0.55, paris: 0.32, vegas: 0.26 };

function startMurmur(c: AudioContext, scenery: SceneryId): void {
  const level = MURMUR_LEVEL[scenery];
  if (!level) return;
  murmur ??= fetch('/vozes/ambiente-bar.mp3').then(async r => {
    if (!r.ok) throw Error('Ambiente indisponível');
    return c.decodeAudioData(await r.arrayBuffer());
  });
  void murmur.then(buffer => {
    if (!ambientOn || ambientScenery !== scenery) return;
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = c.createGain();
    gain.gain.value = level;
    source.connect(gain).connect(ambBus);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start(0, Math.random() * buffer.duration);
    ambientNodes.push(source);
  }).catch(() => { murmur = null; });
}

/** Um copo pousando lá no balcão, de vez em quando. */
function distantClink(): void {
  if (!ctx || !ambientOn || !MURMUR_LEVEL[ambientScenery]) return;
  if (ctx.state === 'running' && !document.hidden) {
    const t = ctx.currentTime + 0.02;
    foley('copo', t, 0.09);
    if (Math.random() < 0.3) foley('copo', t + 0.18 + Math.random() * 0.1, 0.07);
  }
  clinkTimer = setTimeout(distantClink, 7000 + Math.random() * 12000);
}

/** Estalos da lenha, em intervalos irregulares. */
function crackle(): void {
  if (!ctx || !ambientOn) return;
  if (ambientScenery !== 'bolicho') {
    if (ctx.state === 'running' && !document.hidden && ambientScenery !== 'vegas' && ambientScenery !== 'cataratas') {
      const t = ctx.currentTime + 0.02;
      const shore = ambientScenery === 'praia';
      tone(t, shore ? 1100 : 2300, shore ? 0.45 : 0.12, { gain: 0.045, toFreq: shore ? 800 : 3100, attack: 0.035 }, ambBus);
      if (!shore) tone(t + 0.18, 2900, 0.15, { gain: 0.035, toFreq: 2000, attack: 0.025 }, ambBus);
    }
    crackleTimer = setTimeout(crackle, 5000 + Math.random() * 7000);
    return;
  }
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
export function startAmbient(scenery: SceneryId = ambientScenery): void {
  ambientScenery = scenery;
  wantAmbient = true;
  syncMusic();
  if (!ctx || ambientOn) return;
  ambientOn = true;
  const c = ctx;
  // O fogo: um ronco grave e contínuo.
  const fire = c.createBufferSource();
  fire.buffer = brown;
  fire.loop = true;
  const fireLow = c.createBiquadFilter();
  fireLow.type = 'lowpass';
  const beach = scenery === 'praia';
  const falls = scenery === 'cataratas';
  const city = scenery === 'vegas' || scenery === 'paris';
  fireLow.frequency.value = falls ? 1800 : beach ? 950 : city ? 240 : 420;
  const fireGain = c.createGain();
  fireGain.gain.value = scenery === 'bolicho' ? 0.5 : falls ? 0.75 : beach ? 0.12 : city ? 0.18 : 0.035;
  fire.connect(fireLow).connect(fireGain).connect(ambBus);
  // O vento na janela: um sopro que vai e volta devagar.
  const wind = c.createBufferSource();
  wind.buffer = brown;
  wind.loop = true;
  wind.playbackRate.value = 1.7;
  const windBand = c.createBiquadFilter();
  windBand.type = 'bandpass';
  windBand.frequency.value = falls ? 1600 : beach ? 1100 : 520;
  windBand.Q.value = 0.8;
  const windGain = c.createGain();
  windGain.gain.value = beach ? 0.6 : falls ? 0.3 : city ? 0.06 : 0.12;
  const lfo = c.createOscillator();
  lfo.frequency.value = beach ? 0.12 : 0.06;
  const lfoDepth = c.createGain();
  lfoDepth.gain.value = beach ? 0.48 : city ? 0.04 : 0.09;
  lfo.connect(lfoDepth).connect(windGain.gain);
  const lfoFreq = c.createGain();
  lfoFreq.gain.value = 180;
  lfo.connect(lfoFreq).connect(windBand.frequency);
  wind.connect(windBand).connect(windGain).connect(ambBus);
  fire.start();
  wind.start(0, 1.3);
  lfo.start();
  ambientNodes = [fire, wind, lfo];
  startMurmur(c, scenery);
  clinkTimer = setTimeout(distantClink, 4000 + Math.random() * 6000);
  ambBus.gain.cancelScheduledValues(c.currentTime);
  ambBus.gain.setTargetAtTime(document.hidden ? 0 : AMBIENT_LEVEL, c.currentTime, 0.8);
  crackle();
}

/** Desliga o ambiente (ao sair da mesa), sumindo aos poucos. */
export function stopAmbient(): void {
  wantAmbient = false;
  syncMusic();
  if (!ctx || !ambientOn) return;
  ambientOn = false;
  clearTimeout(crackleTimer);
  clearTimeout(clinkTimer);
  const end = ctx.currentTime + 0.6;
  ambBus.gain.cancelScheduledValues(ctx.currentTime);
  ambBus.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
  for (const n of ambientNodes) n.stop(end);
  ambientNodes = [];
}
