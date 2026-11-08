import type { CharacterId } from '@trukenza/shared';
import type { SignalId } from '@trukenza/shared';
import { PHRASE_IDS, PHRASES } from '@trukenza/shared';

export type GestureKind = 'canto' | 'quero' | 'recusa' | 'jogar' | 'vaza' | 'vitoria' | 'derrota';

/** Vozes estilizadas por ritmo e registro, sem imitar pessoas reais. */
export const VOICE_STYLE: Record<CharacterId, { pitch: number; rate: number }> = {
  neymt: { pitch: 1.1, rate: 1.12 }, presuntinho: { pitch: 1.28, rate: 1.03 },
  moleti: { pitch: 0.92, rate: 1.06 }, baiaca: { pitch: 1.02, rate: 0.98 },
  luistesoura: { pitch: 1.16, rate: 1.08 }, sardinha: { pitch: 1.35, rate: 1.12 },
  gordodofusca: { pitch: 0.83, rate: 0.94 }, tiba: { pitch: 0.98, rate: 1.16 },
  negon: { pitch: 1.06, rate: 1.04 },
};

/**
 * Falas do jogo: a primeira variação é a principal (texto da voz do navegador). As demais alternam nas
 * falas locais para a mesa não repetir sempre a mesma frase. Só frases fixas; nenhum nome nem carta.
 */
export const VOICE_LINES: Record<string, readonly string[]> = {
  truco: ['Truco! Vai encarar?', 'Truco!', 'É truco, meu chapa!'],
  retruco: ['Retruco!', 'Quero retruco!'],
  'vale-quatro': ['Vale quatro!', 'Vale quatro, e agora?'],
  envido: ['Envido!', 'Envido, vamos ver!'],
  'real-envido': ['Real envido!'],
  'falta-envido': ['Falta envido!'],
  flor: ['Flor!', 'Tenho flor!'],
  'contra-flor': ['Contra flor!'],
  'contra-flor-resto': ['Contra flor e o resto!'],
  quero: ['Quero!', 'Quero, sim!', 'Aceito!'],
  'nao-quero': ['Não quero!', 'Tô fora!', 'Esse não.'],
  'me-achico': ['Me achico!'],
  baralho: ['Fui ao baralho!', 'Vou pro baralho.'],
  contestar: ['Contesto!'],
  'contestar-flor': ['Contesto a flor!'],
  previa: ['Truco! Vai encarar? Retruco! Vale quatro!'],
  // Reações ocasionais, só quando a mesa está em silêncio.
  vaza: ['Essa é minha!', 'Toma!', 'Fácil, fácil!'],
  'mao-ganha': ['É nóis!', 'Vamo que vamo!', 'Isso aí, parceiro!'],
  'mao-perdida': ['Ah, não!', 'Eita!', 'Tá bom, tá bom.'],
  parda: ['Empatou!', 'Parda!'],
  // Frases rápidas dos jogadores: uma só gravação por frase, igual ao texto do balão.
  ...Object.fromEntries(PHRASE_IDS.map(id => [`frase-${id}`, [PHRASES[id].text]])),
};

export const SPOKEN: Record<string, string> = Object.fromEntries(Object.entries(VOICE_LINES).map(([k, v]) => [k, v[0]!]));

/** Reações não são cantos: tocam só de vez em quando e nunca entram na fila de quem está falando. */
export const REACTIONS = ['vaza', 'mao-ganha', 'mao-perdida', 'parda'] as const;

/**
 * Elenco de vozes das falas locais (geradas por `scripts/generate-voices.ps1` com o Kokoro-82M, Apache 2.0):
 * mistura das três vozes brasileiras do modelo, velocidade e tom em semitons. Inspiradas no jeito de cada
 * personagem, sem imitar pessoas reais.
 */
export const VOICE_CAST: Record<CharacterId, { mix: Partial<Record<'pm_alex' | 'pm_santa' | 'pf_dora', number>>; speed: number; semitones: number }> = {
  neymt:        { mix: { pm_alex: 1 }, speed: 1.08, semitones: 1 },
  presuntinho:  { mix: { pm_santa: 0.8, pf_dora: 0.2 }, speed: 1.05, semitones: 4 },
  moleti:       { mix: { pm_santa: 1 }, speed: 0.97, semitones: -1.5 },
  baiaca:       { mix: { pm_alex: 0.6, pm_santa: 0.4 }, speed: 1, semitones: 0 },
  luistesoura:  { mix: { pm_alex: 0.7, pf_dora: 0.3 }, speed: 1.06, semitones: 2 },
  sardinha:     { mix: { pm_santa: 0.6, pf_dora: 0.4 }, speed: 1.1, semitones: 5 },
  gordodofusca: { mix: { pm_santa: 1 }, speed: 0.9, semitones: -3.5 },
  tiba:         { mix: { pm_alex: 1 }, speed: 1.12, semitones: -1 },
  negon:        { mix: { pm_alex: 0.5, pm_santa: 0.5 }, speed: 1.03, semitones: 2.5 },
};

/** Os desafios têm mais peso; as respostas preservam o ritmo de cada personagem. */
export function callVoiceStyle(call: string, character: CharacterId) {
  const style = VOICE_STYLE[character];
  const challenge = ['truco', 'retruco', 'vale-quatro', 'previa'].includes(call);
  return challenge ? { pitch: style.pitch * 0.94, rate: style.rate * 0.97 } : style;
}

export function smooth(value: number): number {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

function pulse(age: number, attack: number, hold: number, end: number): number {
  if (age < 0 || age >= end) return 0;
  return age < attack ? smooth(age / attack) : 1 - smooth((age - hold) / (end - hold));
}

/** Pose aditiva em segundos: antecipação, acento e retorno suave. Sem acumular rotações. */
export function gesturePose(kind: GestureKind | undefined, age: number) {
  const pose = { arm: 0, spread: 0, lean: 0, twist: 0, nod: 0, shake: 0, bounce: 0 };
  if (!kind || !Number.isFinite(age) || age <= 0 || age >= 1.6) return pose;
  const amount = pulse(age, 0.2, 0.7, 1.6);
  switch (kind) {
    case 'canto': {
      const prepare = pulse(age, 0.12, 0.15, 0.32);
      const accent = pulse(age - 0.16, 0.15, 0.65, 1.44);
      pose.arm = -0.25 * prepare + 1.3 * accent;
      pose.spread = -0.65 * accent;
      pose.lean = 0.08 * prepare - 0.14 * accent;
      pose.twist = -0.08 * accent;
      pose.nod = -0.16 * accent;
      break;
    }
    case 'quero':
      pose.arm = 0.45 * amount;
      pose.nod = Math.sin(age * 9) * 0.16 * amount;
      pose.lean = -0.07 * amount;
      break;
    case 'recusa':
      pose.arm = -0.35 * amount;
      pose.spread = 0.42 * amount;
      pose.shake = Math.sin(age * 10) * 0.22 * amount;
      pose.lean = 0.06 * amount;
      break;
    case 'jogar': {
      const reach = pulse(age, 0.28, 0.42, 0.85);
      pose.arm = 0.4 * reach;
      pose.spread = 0.18 * reach;
      pose.lean = -0.10 * reach;
      pose.twist = -0.06 * reach;
      break;
    }
    case 'vaza':
      pose.arm = 0.6 * amount;
      pose.nod = 0.12 * Math.sin(age * 7) * amount;
      break;
    case 'vitoria':
      pose.arm = 1.45 * amount;
      pose.spread = -0.7 * amount;
      pose.lean = 0.08 * amount;
      pose.bounce = Math.sin(age * 10) ** 2 * 0.025 * amount;
      pose.twist = Math.sin(age * 7) * 0.06 * amount;
      break;
  }
  return pose;
}

/** Sinais voluntários: convenções de gesto, nunca calculadas a partir das cartas. */
export function signalPose(signal: SignalId | undefined, age: number) {
  const p = { brow: 0, leftEye: 1, rightEye: 1, mouthX: 0, mouthY: 0, mouthZ: 0, mouthWidth: 1, mouthHeight: 1, opening: 0, nose: 0, tilt: 0 };
  const a = pulse(age, 0.18, 1.2, 1.8);
  if (!signal || !Number.isFinite(age) || !a) return p;
  switch (signal) {
    case 'sobrancelhas': p.brow = a * 0.042; break;
    case 'piscada': p.leftEye = 1 - a * 0.93; break;
    case 'boca-direita': p.mouthX = -a * 0.03; break;
    case 'boca-esquerda': p.mouthX = a * 0.03; break;
    case 'labio': p.mouthHeight = 1 - a * 0.7; p.mouthY = a * 0.012; break;
    case 'bico': p.mouthWidth = 1 - a * 0.48; p.mouthHeight = 1 + a * 0.4; p.mouthZ = -a * 0.025; break;
    case 'boca-aberta': p.mouthHeight = 1 + a * 1.6; p.opening = a; break;
    case 'cabeca': p.tilt = a * 0.22; break;
    case 'nariz': p.nose = a * 0.016; p.brow = -a * 0.012; break;
    case 'olhos': p.leftEye = p.rightEye = 1 - a * 0.93; break;
  }
  return p;
}
