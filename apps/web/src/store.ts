import { create } from 'zustand';
import { DEFAULT_CHARACTER, parseCharacter, type CharacterId, type Phase, type RoomRules, type SeatStatus } from '@trukenza/shared';
import type { Card } from '@trukenza/game-engine';
import type { GameView } from './game';
import type { GestureKind } from './performance';
import type { TableSignal } from '@trukenza/shared';
import type { SceneryId } from '@trukenza/shared';
import { parseSeenTips, type TipId, type CardSelection } from './handExperience';

/** Jogador como chega do servidor, já em objeto simples (sem os proxies do schema). */
export interface PlayerView {
  id: string;
  name: string;
  character: CharacterId;
  seat: number;
  ready: boolean;
  connected: boolean;
  bot: boolean;
  cards: number;
}

export interface TableView {
  scenery: SceneryId;
  code: string;
  seatCount: number;
  phase: Phase;
  hostId: string;
  rules: RoomRules;
  players: PlayerView[];
  seats: { status: SeatStatus; playerId: string }[];
}

/** Um grito ou aviso na mesa ("TRUCO!", "Quero!", "Foi ao baralho"), perto de quem falou. */
export interface Shout {
  id: number;
  seat: number;
  text: string;
  /** Canto (grande, animado) ou resposta e aviso (menor). */
  big: boolean;
  at: number;
}

/** Gesto de um personagem por um acontecimento público (nunca por carta escondida). */
export interface Gesture {
  kind: GestureKind;
  at: number;
  previous?: { kind: GestureKind; at: number };
}

/** Terceira pessoa (a principal): atrás do próprio personagem, vendo todos. Cartas: de perto, em primeira pessoa. */
export type CameraMode = 'livre' | 'cartas' | 'panorama';
export type Quality = 'alta' | 'baixa';

export interface Toast {
  id: number;
  text: string;
}

interface Store {
  selectedCard: CardSelection | null;
  tipsOn: boolean;
  seenTips: TipId[];
  setTipsOn(on: boolean): void;
  dismissTip(id: TipId): void;
  resetTips(): void;
  name: string;
  character: CharacterId;
  /** Sessão nesta mesa; vazio fora de sala. */
  me: string;
  table: TableView | null;
  /** A partida em andamento (visão pública), ou null. */
  game: GameView | null;
  hand: Card[];
  /** O que este jogador pode fazer agora (do servidor) e a versão do estado a que isso se refere. */
  actions: string[];
  playable: string[];
  handVersion: number;
  shouts: Shout[];
  gestures: Record<number, Gesture>;
  signals: Record<number, TableSignal & { at: number }>;
  signalNextAt: number;
  camera: CameraMode;
  quality: Quality;
  /** Som ligado e volume geral (0 a 1); ficam lembrados. */
  soundOn: boolean;
  volume: number;
  musicOn: boolean;
  musicVolume: number;
  voiceOn: boolean;
  voiceVolume: number;
  voiceId: string;
  voices: { id: string; name: string }[];
  voiceStatus: 'loading' | 'ready' | 'error';
  voiceFallback: boolean;
  speaking: { seat: number; text: string; at: number } | null;
  toasts: Toast[];
  /** A conexão caiu e o SDK está tentando voltar. */
  reconnecting: boolean;
  setName(name: string): void;
  setCharacter(character: CharacterId): void;
  setCamera(camera: CameraMode): void;
  setQuality(quality: Quality): void;
  setSoundOn(on: boolean): void;
  setVolume(volume: number): void;
  setMusicOn(on: boolean): void;
  setMusicVolume(volume: number): void;
  setVoiceOn(on: boolean): void;
  setVoiceVolume(volume: number): void;
  setVoiceId(id: string): void;
  toast(text: string): void;
}

const NAME_KEY = 'trukenza.nome.v1';
const CHARACTER_KEY = 'trukenza.personagem.v1';
const QUALITY_KEY = 'trukenza.qualidade.v1';
const SOUND_KEY = 'trukenza.som.v1';
const VOLUME_KEY = 'trukenza.volume.v1';
const MUSIC_KEY = 'trukenza.musica.v1';
const MUSIC_VOLUME_KEY = 'trukenza.volume-musica.v1';
const VOICE_KEY = 'trukenza.voz.v1';
const VOICE_VOLUME_KEY = 'trukenza.volume-voz.v1';
const VOICE_ID_KEY = 'trukenza.voz-escolhida.v1';

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sem armazenamento: só não fica lembrado.
  }
}

/** Celular ou tablet começa na qualidade baixa; a escolha fica lembrada. */
function initialQuality(): Quality {
  const saved = load(QUALITY_KEY);
  if (saved === 'alta' || saved === 'baixa') return saved;
  return window.matchMedia('(pointer: coarse)').matches ? 'baixa' : 'alta';
}

function initialVolume(key = VOLUME_KEY, fallback = 0.7): number {
  const saved = load(key);
  const v = Number(saved);
  return saved !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

const TOAST_MS = 4200;
let toastId = 0;

export const useStore = create<Store>((set) => ({
  selectedCard: null,
  tipsOn: load('trukenza.dicas.v1') !== 'nao',
  seenTips: parseSeenTips(load('trukenza.dicas-vistas.v1')),
  setTipsOn(tipsOn) {
    save('trukenza.dicas.v1', tipsOn ? 'sim' : 'nao');
    set({ tipsOn });
  },
  dismissTip(id) {
    set(s => {
      const seenTips = [...new Set([...s.seenTips, id])];
      save('trukenza.dicas-vistas.v1', JSON.stringify(seenTips));
      return { seenTips };
    });
  },
  resetTips() {
    save('trukenza.dicas.v1', 'sim');
    save('trukenza.dicas-vistas.v1', '[]');
    set({ tipsOn: true, seenTips: [] });
  },
  name: load(NAME_KEY) ?? '',
  character: parseCharacter(load(CHARACTER_KEY)) ?? DEFAULT_CHARACTER,
  me: '',
  table: null,
  game: null,
  hand: [],
  actions: [],
  playable: [],
  handVersion: 0,
  shouts: [],
  gestures: {},
  signals: {},
  signalNextAt: 0,
  camera: 'livre',
  quality: initialQuality(),
  soundOn: load(SOUND_KEY) !== 'nao',
  volume: initialVolume(),
  musicOn: load(MUSIC_KEY) !== 'nao',
  musicVolume: initialVolume(MUSIC_VOLUME_KEY, 0.5),
  voiceOn: load(VOICE_KEY) !== 'nao',
  voiceVolume: initialVolume(VOICE_VOLUME_KEY, 0.9),
  voiceId: load(VOICE_ID_KEY) ?? '',
  voices: [],
  voiceStatus: 'loading',
  voiceFallback: false,
  speaking: null,
  toasts: [],
  reconnecting: false,
  setName(name) {
    save(NAME_KEY, name);
    set({ name });
  },
  setCharacter(character) {
    save(CHARACTER_KEY, character);
    set({ character });
  },
  setCamera(camera) {
    set({ camera });
  },
  setQuality(quality) {
    save(QUALITY_KEY, quality);
    set({ quality });
  },
  setSoundOn(soundOn) {
    save(SOUND_KEY, soundOn ? 'sim' : 'nao');
    set({ soundOn });
  },
  setVolume(volume) {
    save(VOLUME_KEY, String(volume));
    set({ volume });
  },
  setMusicOn(musicOn) {
    save(MUSIC_KEY, musicOn ? 'sim' : 'nao');
    set({ musicOn });
  },
  setMusicVolume(musicVolume) {
    save(MUSIC_VOLUME_KEY, String(musicVolume));
    set({ musicVolume });
  },
  setVoiceOn(voiceOn) {
    save(VOICE_KEY, voiceOn ? 'sim' : 'nao');
    set({ voiceOn });
  },
  setVoiceVolume(voiceVolume) {
    save(VOICE_VOLUME_KEY, String(voiceVolume));
    set({ voiceVolume });
  },
  setVoiceId(voiceId) {
    save(VOICE_ID_KEY, voiceId);
    set({ voiceId });
  },
  toast(text) {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), TOAST_MS);
  },
}));

/** O próprio jogador na mesa, se estiver numa. */
export function selectMe(s: Pick<Store, 'me' | 'table'>): PlayerView | undefined {
  return s.table?.players.find((p) => p.id === s.me);
}

