import { CloseCode, ColyseusSDK, type Room } from '@colyseus/sdk';
import { cardId, parseCardId, type Card, type MatchEvent } from '@trukenza/game-engine';
import { SHOUTS, teamName, teamOfSeat, type GameView } from './game';
import {
  CLOSE_IDLE,
  DEFAULT_CHARACTER,
  IDLE_TEXT,
  MSG_ADD_BOTS,
  MSG_CHARACTER,
  MSG_ACTION,
  MSG_END,
  MSG_HAND,
  MSG_READY,
  MSG_REFUSED,
  MSG_REMATCH,
  MSG_REMOVE_BOT,
  MSG_RULES,
  MSG_SIT,
  MSG_STAND,
  MSG_START,
  PHASE_PLAYING,
  PHASE_WAITING,
  ROOM_LIST_PATH,
  ROOM_NAME,
  SEAT_FREE,
  describeJoinError,
  normalizeServerUrl,
  parseCharacter,
  parseName,
  parseRoomList,
  parseRules,
  sessionForServer,
  type CharacterId,
  type CreateRoomOptions,
  type JoinOptions,
  type RoomRules,
  type RoomSummary,
  type SavedSession,
  type SeatCount,
  type SeatStatus,
} from '@trukenza/shared';
import { useStore, type PlayerView, type TableView } from './store';
import { dealSound, pointsSound, sfx } from './sound';

/** Forma do estado sincronizado (o cliente decodifica por reflexão, sem importar o schema do servidor). */
interface NetState {
  seatCount: number;
  phase: string;
  hostId: string;
  goal: number;
  flor: boolean;
  turnSeconds: number;
  game: string;
  players: { forEach(cb: (p: Omit<PlayerView, 'id' | 'character' | 'bot'> & { character: string; bot?: boolean }, id: string) => void): void };
  seats: { forEach(cb: (s: { status: string; playerId: string }) => void): void };
}

const query = new URLSearchParams(location.search);

/** Em trukenza.win o servidor fica em play.trukenza.win (túnel nomeado da Cloudflare); fora dele, na porta 2580. */
export const serverUrl =
  query.get('servidor') ?? (location.hostname === 'trukenza.win' ? 'wss://play.trukenza.win' : `ws://${location.hostname}:2580`);
const sdk = new ColyseusSDK(serverUrl);
const roomListUrl = serverUrl.replace(/^ws/, 'http').replace(/\/+$/, '') + ROOM_LIST_PATH;

let room: Room | null = null;

// Sessão guardada por aba: recarregar a página volta à mesma cadeira enquanto ela estiver guardada.
const SESSION_KEY = 'trukenza.sessao.v1';

function saveSession(r: Room): void {
  try {
    const s: SavedSession = { server: normalizeServerUrl(serverUrl), code: r.roomId, token: r.reconnectionToken };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    // Sem armazenamento: só não haverá retomada após recarregar.
  }
}

export function loadSession(): SavedSession | null {
  let raw: unknown = null;
  try {
    raw = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    // Ilegível: tratada como de outro servidor.
  }
  const s = sessionForServer(raw, serverUrl);
  if (!s && raw !== null) clearSession();
  return s;
}

function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nada a limpar.
  }
}

const SEAT_STATUSES: readonly string[] = ['livre', 'reservada', 'ocupada', 'desconectada'];

/** Copia o estado do schema para objetos simples, que o React compara e a cena lê sem proxies. */
function snapshot(r: Room, s: NetState): TableView {
  const players: PlayerView[] = [];
  s.players.forEach((p, id) => {
    players.push({
      id, name: p.name, character: parseCharacter(p.character) ?? DEFAULT_CHARACTER,
      seat: p.seat, ready: p.ready, connected: p.connected, bot: p.bot === true, cards: p.cards,
    });
  });
  const seats: TableView['seats'] = [];
  s.seats.forEach((seat) => {
    seats.push({ status: (SEAT_STATUSES.includes(seat.status) ? seat.status : SEAT_FREE) as SeatStatus, playerId: seat.playerId });
  });
  return {
    code: r.roomId,
    seatCount: s.seatCount,
    phase: s.phase === PHASE_PLAYING ? PHASE_PLAYING : PHASE_WAITING,
    hostId: s.hostId,
    rules: parseRules({ goal: s.goal, flor: s.flor, turnSeconds: s.turnSeconds }),
    players,
    seats,
  };
}

/** O JSON da partida; vazio ou ilegível vira null (a mesa mostra a espera). */
function parseGame(json: string): GameView | null {
  if (!json) return null;
  try {
    return { ...(JSON.parse(json) as Omit<GameView, 'receivedAt'>), receivedAt: performance.now() };
  } catch {
    return null;
  }
}

const SHOUT_MS = 2200;
let shoutId = 0;

function shout(seat: number, text: string, big: boolean): void {
  const id = ++shoutId;
  useStore.setState((s) => ({ shouts: [...s.shouts.slice(-3), { id, seat, text, big, at: performance.now() }] }));
  setTimeout(() => useStore.setState((s) => ({ shouts: s.shouts.filter((x) => x.id !== id) })), SHOUT_MS);
}

function gesture(seats: number[], kind: 'canto' | 'vitoria'): void {
  const at = performance.now();
  useStore.setState((s) => ({ gestures: { ...s.gestures, ...Object.fromEntries(seats.map((seat) => [seat, { kind, at }])) } }));
}

/** Encena um acontecimento público: grito, gesto, aviso e som. Nada daqui revela carta escondida. */
function stage(e: MatchEvent, game: GameView, table: TableView): void {
  const nameAt = (seat: number) => table.players.find((p) => p.seat === seat)?.name ?? `Cadeira ${seat + 1}`;
  const team = (t: 0 | 1) => teamName(t, game.seats, nameAt);
  const { toast, me } = useStore.getState();
  const mySeat = table.players.find((p) => p.id === me)?.seat ?? -1;
  const myTeam = mySeat >= 0 ? teamOfSeat(mySeat) : null;
  switch (e.kind) {
    case 'nova-mao':
      sfx('embaralhar');
      dealSound(game.seats, 1.05);
      return;
    case 'carta':
      sfx('carta');
      return;
    case 'canto':
      shout(e.seat, SHOUTS[e.call] ?? e.call, true);
      gesture([e.seat], 'canto');
      sfx('canto');
      return;
    case 'resposta':
      shout(e.seat, SHOUTS[e.answer] ?? e.answer, false);
      sfx(e.answer === 'quero' ? 'quero' : 'nao-quero');
      return;
    case 'baralho':
      shout(e.seat, 'Fui ao baralho', false);
      sfx('recolher');
      return;
    case 'vaza':
      // Depois de a última carta pousar.
      if (e.outcome === 'parda') {
        toast(`Vaza ${e.trick + 1}: parda!`);
        sfx('parda', 0.45);
      } else if (e.winnerSeat !== null && teamOfSeat(e.winnerSeat) === myTeam) {
        sfx('vaza-nossa', 0.45);
      }
      return;
    case 'envido': {
      const r = e.result;
      pointsSound(r.value, 0.3);
      toast(
        r.accepted
          ? `Envido: ${team(0)} ${r.best[0] ?? '-'} × ${r.best[1] ?? '-'} ${team(1)}. ${team(r.winnerTeam)} leva ${r.value}.`
          : `Envido recusado: ${team(r.winnerTeam)} leva ${r.value}.`,
      );
      return;
    }
    case 'flor': {
      const r = e.result;
      pointsSound(r.value, 0.3);
      toast(
        !r.contested
          ? `Flor: ${team(r.winnerTeam)} leva ${r.value}.`
          : r.accepted
            ? `Flor contra Flor: ${team(0)} ${r.best[0]} × ${r.best[1]} ${team(1)}. ${team(r.winnerTeam)} leva ${r.value}.`
            : `Me achico: ${team(r.winnerTeam)} leva ${r.value}.`,
      );
      return;
    }
    case 'contestacao': {
      const against = team(e.team);
      shout(e.seat, e.about === 'flor' ? 'CONTESTO A FLOR!' : 'CONTESTO!', true);
      gesture([e.seat], 'canto');
      sfx('canto');
      if (e.value) pointsSound(e.value, 0.6);
      if (e.about === 'truco') toast(`Truco antes do Envido contestado: o Envido queimou${e.value ? ` e ${against} perde ${e.value}` : ''}.`);
      else toast(e.ok ? `Flor escondida! Os pontos do Envido de ${against} passam para ${team(e.team === 0 ? 1 : 0)}.` : 'Contestação sem Flor à vista: nada muda.');
      return;
    }
    case 'fim-mao':
      // As cartas são recolhidas depois de uma pausa (TableCards: COLLECT_AFTER_S = 2,1 s).
      sfx('recolher', 2.1);
      if (e.winnerTeam !== null) {
        pointsSound(e.value, 0.8);
        toast(`${team(e.winnerTeam)} ganha a mão${e.value ? ` (+${e.value})` : ''}.`);
        gesture(
          Array.from({ length: game.seats }, (_, s) => s).filter((s) => teamOfSeat(s) === e.winnerTeam),
          'vitoria',
        );
      }
      return;
    case 'fim-partida':
      sfx(myTeam === null || myTeam === e.winner ? 'vitoria' : 'derrota', 1.2);
      return;
    default:
      return;
  }
}

const PRESENCE = { entrou: 'entrou na mesa', saiu: 'saiu da mesa', caiu: 'perdeu a conexão', voltou: 'voltou' } as const;

/** Avisa quem entrou, saiu, caiu ou voltou (o próprio jogador não gera aviso). */
function diffPresence(before: TableView | null, now: TableView, me: string): void {
  if (!before) return;
  const toast = useStore.getState().toast;
  const old = new Map(before.players.map((p) => [p.id, p]));
  // O computador entra e sai sem aviso: com três de uma vez, os avisos só atrapalhariam.
  for (const p of now.players) {
    if (p.id === me || p.bot) continue;
    const was = old.get(p.id);
    if (!was) toast(`${p.name} ${PRESENCE.entrou}`);
    else if (was.connected !== p.connected) toast(`${p.name} ${p.connected ? PRESENCE.voltou : PRESENCE.caiu}`);
  }
  const ids = new Set(now.players.map((p) => p.id));
  for (const p of before.players) if (p.id !== me && !p.bot && !ids.has(p.id)) toast(`${p.name} ${PRESENCE.saiu}`);
}

function joinOptions(): JoinOptions {
  const { name, character } = useStore.getState();
  const valid = parseName(name);
  return valid ? { name: valid, character } : { character };
}

/**
 * Entra numa sala (criada, pelo código ou retomada) e liga o estado à loja.
 * Devolve a mensagem de erro, ou null se entrou.
 */
async function enter(joining: Promise<Room>, failure?: string): Promise<string | null> {
  let r: Room;
  try {
    r = await joining;
  } catch (error) {
    if (failure) clearSession();
    return failure ?? describeJoinError(error);
  }
  room = r;
  saveSession(r);
  useStore.setState({ me: r.sessionId, hand: [], actions: [], playable: [], game: null, reconnecting: false });
  let gameJson = '';
  let lastEvent = -1;
  r.onStateChange((s: NetState) => {
    const before = useStore.getState().table;
    const table = snapshot(r, s);
    diffPresence(before, table, r.sessionId);
    useStore.setState({ table });
    if (s.game === gameJson) return;
    gameJson = s.game ?? '';
    const game = parseGame(gameJson);
    // Ao entrar (ou voltar) no meio da partida, o que já aconteceu não é encenado de novo.
    if (game && lastEvent < 0) lastEvent = game.events.at(-1)?.id ?? 0;
    if (!game) lastEvent = -1;
    useStore.setState({ game });
    if (game) {
      for (const e of game.events) if (e.id > lastEvent) stage(e, game, table);
      lastEvent = Math.max(lastEvent, game.events.at(-1)?.id ?? 0);
    }
  });
  r.onMessage(MSG_HAND, (m: { cards?: unknown; actions?: unknown; playable?: unknown; version?: unknown }) => {
    const cards = Array.isArray(m?.cards) ? m.cards.map(parseCardId).filter((c): c is Card => c !== null) : [];
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    useStore.setState({
      hand: cards,
      actions: strings(m?.actions),
      playable: strings(m?.playable),
      handVersion: typeof m?.version === 'number' ? m.version : 0,
    });
  });
  r.onMessage(MSG_REFUSED, (m: { text?: unknown }) => {
    if (typeof m?.text === 'string') useStore.getState().toast(m.text);
  });
  r.onDrop(() => useStore.setState({ reconnecting: true }));
  r.onReconnect(() => useStore.setState({ reconnecting: false }));
  r.onLeave((code: number) => {
    if (room !== r) return;
    room = null;
    // Recarregar a aba também derruba a conexão: aí a sessão guardada precisa ficar.
    if (!unloading) clearSession();
    useStore.setState({ me: '', table: null, game: null, hand: [], actions: [], playable: [], reconnecting: false });
    if (code === CLOSE_IDLE) useStore.getState().toast(IDLE_TEXT);
    else if (code !== CloseCode.CONSENTED && !unloading) useStore.getState().toast('A conexão com a mesa caiu.');
  });
  return null;
}

let unloading = false;
window.addEventListener('pagehide', () => {
  unloading = true;
});

/** Com `bots`, o computador ocupa as outras cadeiras assim que você chega (mesa privada). */
export function createRoom(seats: SeatCount, open: boolean, bots: boolean, rules: RoomRules): Promise<string | null> {
  const options: CreateRoomOptions = { ...joinOptions(), seats, open: open && !bots, bots, rules };
  return enter(sdk.create(ROOM_NAME, options));
}

export function joinRoom(code: string): Promise<string | null> {
  return enter(sdk.joinById(code, joinOptions()));
}

export function resumeRoom(saved: SavedSession): Promise<string | null> {
  return enter(sdk.reconnect(saved.token), 'A cadeira na mesa anterior não estava mais guardada. Entre de novo pelo código.');
}

export function leaveRoom(): void {
  void room?.leave();
}

export function sit(seat: number): void {
  room?.send(MSG_SIT, { seat });
}

export function stand(): void {
  room?.send(MSG_STAND);
}

export function setReady(ready: boolean): void {
  room?.send(MSG_READY, { ready });
}

export function chooseCharacter(character: CharacterId): void {
  useStore.getState().setCharacter(character);
  room?.send(MSG_CHARACTER, { character });
}

export function startMatch(): void {
  room?.send(MSG_START);
}

/** Uma jogada ou um canto, com a versão do estado a que as ações mostradas se referem. */
export function sendAction(type: string, card?: Card): void {
  room?.send(MSG_ACTION, { type, card: card ? cardId(card) : undefined, version: useStore.getState().handVersion });
}

/** Anfitrião, na espera: regras da partida. */
export function setRules(rules: RoomRules): void {
  room?.send(MSG_RULES, rules);
}

/** Anfitrião, com a partida terminada: outra partida com as mesmas cadeiras. */
export function rematch(): void {
  room?.send(MSG_REMATCH);
}

export function endMatch(): void {
  room?.send(MSG_END);
}

/** Anfitrião: completa as cadeiras livres com o computador. */
export function addBots(): void {
  room?.send(MSG_ADD_BOTS);
}

export function removeBot(seat: number): void {
  room?.send(MSG_REMOVE_BOT, { seat });
}

export async function fetchRooms(): Promise<RoomSummary[] | null> {
  try {
    const res = await fetch(roomListUrl, { cache: 'no-store' });
    if (!res.ok) return null;
    return parseRoomList(await res.json());
  } catch {
    return null;
  }
}

/** Link de convite: a página com `?mesa=CODIGO` (e o servidor, se não for o padrão). */
export function inviteLink(code: string): string {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('mesa', code);
  const server = query.get('servidor');
  if (server) url.searchParams.set('servidor', server);
  return url.toString();
}

export const invitedCode = query.get('mesa');

