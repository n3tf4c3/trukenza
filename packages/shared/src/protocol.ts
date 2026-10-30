import { parseCharacter, type CharacterId } from './characters.ts';

export const ROOM_NAME = 'mesa';

/** Mesas de 2 (mano a mano) ou 4 (duas duplas, parceiros frente a frente). */
export const SEAT_COUNTS = [2, 4] as const;
export type SeatCount = (typeof SEAT_COUNTS)[number];

// Sem 0/O, 1/I/L: o código é ditado e digitado por pessoas.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

// Mensagens cliente → servidor. O cliente só pede; quem decide é a sala.
export const MSG_CHARACTER = 'personagem';
export const MSG_SIT = 'sentar';
export const MSG_STAND = 'levantar';
export const MSG_READY = 'pronto';
/** Só o anfitrião: começa a partida (todas as cadeiras ocupadas e todos prontos). */
export const MSG_START = 'comecar';
/** Só o anfitrião: encerra a partida e volta à espera. */
export const MSG_END = 'encerrar';
/** Só o anfitrião, com a partida terminada: começa outra com as mesmas cadeiras. */
export const MSG_REMATCH = 'revanche';
/** Só o anfitrião, na espera: `RoomRules` (meta, Flor, tempo). Ficam travadas durante a partida. */
export const MSG_RULES = 'regras';
/**
 * Uma jogada ou um canto: `{ type, card?, version }`. O tipo e a carta são validados pelo motor
 * (`parseAction` em @trukenza/game-engine); `version` é a do estado que o jogador viu, e uma versão
 * diferente da atual é recusada (comando repetido ou atrasado).
 */
export const MSG_ACTION = 'acao';
/** Só o anfitrião, na espera: completa as cadeiras livres com o computador. */
export const MSG_ADD_BOTS = 'completar';
/** Só o anfitrião, na espera: `{ seat }`, tira o computador dessa cadeira. */
export const MSG_REMOVE_BOT = 'tirar-computador';

// Mensagens servidor → cliente.
/** Só para o dono das cartas: `HandMessage`. As mãos nunca vão no estado sincronizado. */
export const MSG_HAND = 'mao';
/** Recusa de um pedido, para o jogador entender o que houve: `{ text }`. */
export const MSG_REFUSED = 'recusa';

export interface HandMessage {
  /** Identificadores `cardId` do motor ("1-espadas"); vazio fora da partida. */
  cards: string[];
  /** O que este jogador pode fazer agora (tipos de ação do motor, sem repetição); vazio se não é com ele. */
  actions: string[];
  /** Cartas que pode jogar agora. */
  playable: string[];
  /** Versão do estado a que estas ações se referem (vai de volta em `MSG_ACTION`). */
  version: number;
}

/** Regras escolhidas para a mesa (perfil Gaudério). */
export interface RoomRules {
  goal: 12 | 24;
  flor: boolean;
  /** Segundos para cada jogada ou resposta; ao acabar, o computador joga pela pessoa. */
  turnSeconds: number;
}

export const TURN_SECONDS = [15, 30, 60] as const;
export const DEFAULT_RULES: RoomRules = { goal: 24, flor: true, turnSeconds: 30 };

/** Valida as regras vindas do cliente; o que faltar ou vier fora do formato fica no padrão. */
export function parseRules(raw: unknown, base: RoomRules = DEFAULT_RULES): RoomRules {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    goal: r.goal === 12 || r.goal === 24 ? r.goal : base.goal,
    flor: typeof r.flor === 'boolean' ? r.flor : base.flor,
    turnSeconds: (TURN_SECONDS as readonly unknown[]).includes(r.turnSeconds) ? (r.turnSeconds as number) : base.turnSeconds,
  };
}

/** `version` da mensagem de ação: inteiro não negativo, ou null. */
export function parseActionVersion(raw: unknown): number | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const v = (raw as Record<string, unknown>).version;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

export const NAME_MAX = 16;

/** Nome visível: 1 a NAME_MAX letras, números, espaço, ponto, hífen ou sublinhado; espaços repetidos viram um. */
export function parseName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length === 0 || [...name].length > NAME_MAX) return null;
  return /^[\p{L}\p{N} ._-]+$/u.test(name) ? name : null;
}

export function placeholderName(order: number): string {
  return `Jogador ${order + 1}`;
}

export interface JoinOptions {
  name?: string;
  character?: CharacterId;
}

export interface CreateRoomOptions extends JoinOptions {
  seats?: SeatCount;
  /** Sala pública: aparece com código e nomes na lista. Sem o campo, a sala é privada. */
  open?: boolean;
  /** Contra o computador: quando o anfitrião chega, o computador ocupa as outras cadeiras. */
  bots?: boolean;
  /** Regras iniciais (o anfitrião ainda pode mudar antes de começar). */
  rules?: Partial<RoomRules>;
}

export function parseSeatCount(raw: unknown): SeatCount {
  return raw === 4 ? 4 : 2;
}

/** `{ seat }` com um índice inteiro de cadeira; o limite superior é conferido pela mesa. */
export function parseSitMessage(raw: unknown): number | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const seat = (raw as Record<string, unknown>).seat;
  return typeof seat === 'number' && Number.isInteger(seat) && seat >= 0 && seat < 4 ? seat : null;
}

export function parseCharacterMessage(raw: unknown): CharacterId | null {
  if (typeof raw !== 'object' || raw === null) return null;
  return parseCharacter((raw as Record<string, unknown>).character);
}

export function parseReadyMessage(raw: unknown): boolean | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const ready = (raw as Record<string, unknown>).ready;
  return typeof ready === 'boolean' ? ready : null;
}

/** Caminho HTTP do servidor com a lista das salas (`RoomSummary[]`). */
export const ROOM_LIST_PATH = '/salas';

/** Uma sala na lista do lobby. A privada não revela código nem nomes. */
export interface RoomSummary {
  code: string | null;
  seats: SeatCount;
  /** Pessoas na mesa (é o que lota a sala). */
  players: number;
  /** Cadeiras com o computador: quem entrar pode sentar no lugar dele. */
  bots: number;
  names: string[];
  playing: boolean;
  /** Tentos da partida e Flor (para quem escolhe a mesa pela lista). */
  goal: 12 | 24;
  flor: boolean;
}

const MAX_LISTED_ROOMS = 100;

/** Valida a lista vinda do servidor; entradas fora do formato são descartadas. */
export function parseRoomList(raw: unknown): RoomSummary[] {
  if (!Array.isArray(raw)) return [];
  const rooms: RoomSummary[] = [];
  for (const item of raw.slice(0, MAX_LISTED_ROOMS)) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    const code = r.code === null ? null : typeof r.code === 'string' ? (normalizeRoomCode(r.code) ?? undefined) : undefined;
    if (code === undefined || (r.seats !== 2 && r.seats !== 4)) continue;
    const seats = r.seats;
    const count = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= seats ? v : null);
    const players = count(r.players);
    // Servidor antigo, sem o campo: nenhum computador.
    const bots = r.bots === undefined ? 0 : count(r.bots);
    if (players === null || bots === null) continue;
    const names = code && Array.isArray(r.names) ? r.names.filter((n): n is string => parseName(n) === n).slice(0, seats) : [];
    // Servidor antigo, sem os campos de regras: o padrão.
    const goal = r.goal === 12 ? 12 : 24;
    rooms.push({ code, seats, players, bots, names, playing: r.playing === true, goal, flor: r.flor !== false });
  }
  return rooms;
}

/** Normaliza o que a pessoa digitou ("ab-cd 23" → "ABCD23"); devolve null se não for um código válido. */
export function normalizeRoomCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** Recusa por excesso de tentativas de criar ou entrar em sala (HTTP 429). */
export const TOO_MANY_JOINS = 'Muitas tentativas de entrar em sala. Espere um minuto e tente de novo.';
/** Recusa por limite de salas abertas no servidor (HTTP 503). */
export const SERVER_FULL = 'O servidor está cheio agora: tente criar a mesa de novo em alguns minutos ou entre numa mesa pelo código.';
/** Salas criadas por um mesmo endereço que podem estar abertas ao mesmo tempo. */
export const ROOMS_PER_ADDRESS = 3;
export const TOO_MANY_ROOMS = `Já há ${ROOMS_PER_ADDRESS} mesas abertas criadas da sua rede: saia de uma ou entre numa mesa pelo código.`;

/** Código de fechamento da sala que ficou parada na espera. */
export const CLOSE_IDLE = 4100;
export const IDLE_MINUTES = 15;
export const IDLE_TEXT = `A mesa fechou depois de ${IDLE_MINUTES} minutos sem nenhuma ação.`;

/**
 * Traduz a recusa do matchmaking em mensagem para o jogador. A sala só fica trancada
 * ao encher as cadeiras, então "locked" = cheia.
 */
export function describeJoinError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  for (const known of [TOO_MANY_JOINS, SERVER_FULL, TOO_MANY_ROOMS]) if (message.includes(known)) return known;
  if (/is locked/.test(message)) return 'Mesa cheia: todas as cadeiras já têm dono.';
  if (/not found/.test(message)) return 'Nenhuma mesa com esse código.';
  return 'Não foi possível entrar na mesa. Tente de novo.';
}

/** Sessão guardada no navegador para voltar à mesma cadeira depois de recarregar a página. */
export interface SavedSession {
  /** Servidor que emitiu o token (normalizeServerUrl). */
  server: string;
  code: string;
  token: string;
}

export function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * A sessão guardada, se foi emitida pelo servidor atual. O token dá acesso à cadeira: nunca vai
 * para outro servidor (um link com `?servidor=` trocado o entregaria).
 */
export function sessionForServer(raw: unknown, server: string): SavedSession | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.server !== 'string' || typeof s.code !== 'string' || typeof s.token !== 'string') return null;
  if (s.server !== normalizeServerUrl(server) || !s.token) return null;
  return { server: s.server, code: s.code, token: s.token };
}
