import { CHARACTER_IDS, DEFAULT_CHARACTER, type CharacterId } from './characters.ts';
import { DEFAULT_RULES, type RoomRules, type SeatCount } from './protocol.ts';

/**
 * A mesa: quem está na sala, quem senta onde, quem está pronto e quem é o anfitrião.
 * Pura e sem relógio: a sala do servidor chama os métodos na ordem em que as mensagens chegam
 * (uma por vez, no laço do Node), então dois pedidos pela mesma cadeira nunca valem os dois.
 */

export const PHASE_WAITING = 'espera';
export const PHASE_PLAYING = 'jogando';
export type Phase = typeof PHASE_WAITING | typeof PHASE_PLAYING;

export const SEAT_FREE = 'livre';
/** Escolhida: o personagem está indo até a cadeira (dura `SIT_MS`). */
export const SEAT_RESERVED = 'reservada';
export const SEAT_TAKEN = 'ocupada';
/** Dono caiu e a cadeira fica guardada durante o prazo de reconexão. */
export const SEAT_AWAY = 'desconectada';
export type SeatStatus = typeof SEAT_FREE | typeof SEAT_RESERVED | typeof SEAT_TAKEN | typeof SEAT_AWAY;

/** Tempo da caminhada até a cadeira; o servidor chama `settle` depois disso. */
export const SIT_MS = 1400;

export interface TablePlayer {
  id: string;
  name: string;
  character: CharacterId;
  /** Índice da cadeira; -1 = de pé. */
  seat: number;
  /** Já chegou à cadeira (a reserva virou ocupação). */
  settled: boolean;
  ready: boolean;
  connected: boolean;
  /** Jogador do computador: sem conexão, sempre pronto, nunca anfitrião, cede a cadeira a quem chega. */
  bot: boolean;
}

/** Resultado de um pedido: 'ok' ou o motivo da recusa (texto em REFUSAL_TEXT). */
export type TableResult =
  | 'ok'
  | 'desconhecido'
  | 'cadeira-invalida'
  | 'cadeira-ocupada'
  | 'partida-em-andamento'
  | 'nao-sentado'
  | 'nao-chegou'
  | 'so-anfitriao'
  | 'mesa-incompleta'
  | 'faltam-prontos'
  | 'sem-partida'
  | 'sem-cadeira-livre'
  | 'nao-e-computador';

export const REFUSAL_TEXT: Record<Exclude<TableResult, 'ok'>, string> = {
  desconhecido: 'Você não está nesta mesa.',
  'cadeira-invalida': 'Essa cadeira não existe nesta mesa.',
  'cadeira-ocupada': 'Alguém sentou nessa cadeira antes de você.',
  'partida-em-andamento': 'A partida já começou: espere ela terminar.',
  'nao-sentado': 'Escolha uma cadeira primeiro.',
  'nao-chegou': 'Espere seu personagem chegar à cadeira.',
  'so-anfitriao': 'Só o anfitrião pode fazer isso.',
  'mesa-incompleta': 'Todas as cadeiras precisam estar ocupadas.',
  'faltam-prontos': 'Todos precisam estar prontos.',
  'sem-partida': 'Não há partida em andamento.',
  'sem-cadeira-livre': 'Não há cadeira livre para o computador.',
  'nao-e-computador': 'Essa cadeira não é do computador.',
};

/** Prefixo dos ids do computador: o Colyseus nunca gera sessão com dois-pontos. */
export const BOT_PREFIX = 'cpu:';

/** Na mesa de 4, parceiros ficam frente a frente: cadeiras 0 e 2 contra 1 e 3. */
export function teamOf(seat: number): number {
  return seat % 2;
}

export class Table {
  readonly seatCount: SeatCount;
  phase: Phase = PHASE_WAITING;
  readonly players = new Map<string, TablePlayer>();
  /** Regras da partida: o anfitrião muda na espera; durante a partida ficam travadas. */
  rules: RoomRules;
  /** Ordem de chegada: o primeiro é o anfitrião; se ele sair, o seguinte assume. */
  private arrivals: string[] = [];

  constructor(seatCount: SeatCount, rules: RoomRules = DEFAULT_RULES) {
    this.seatCount = seatCount;
    this.rules = { ...rules };
  }

  setRules(requester: string, rules: RoomRules): TableResult {
    if (!this.players.has(requester)) return 'desconhecido';
    if (requester !== this.hostId) return 'so-anfitriao';
    if (this.phase !== PHASE_WAITING) return 'partida-em-andamento';
    this.rules = { ...rules };
    return 'ok';
  }

  get hostId(): string {
    return this.arrivals[0] ?? '';
  }

  /** Posição de chegada, para o nome provisório ("Jogador N"). */
  arrivalIndex(id: string): number {
    return this.arrivals.indexOf(id);
  }

  join(id: string, name: string, character: CharacterId = DEFAULT_CHARACTER): TablePlayer {
    const player: TablePlayer = { id, name, character, seat: -1, settled: false, ready: false, connected: true, bot: false };
    this.players.set(id, player);
    this.arrivals.push(id);
    return player;
  }

  /** Pessoas na mesa (o computador não conta para a lista nem para a lotação da sala). */
  humans(): TablePlayer[] {
    return [...this.players.values()].filter((p) => !p.bot);
  }

  /**
   * O anfitrião completa as cadeiras livres com o computador, só na espera. Cada um chega andando,
   * como as pessoas (o servidor chama `settle` depois), já pronto, com o personagem menos usado
   * na mesa para variar. `keepFree` deixa essa cadeira para o próprio anfitrião escolher.
   */
  addBots(requester: string, keepFree = -1): { result: TableResult; added: TablePlayer[] } {
    const refuse = (result: TableResult) => ({ result, added: [] });
    if (!this.players.has(requester)) return refuse('desconhecido');
    if (requester !== this.hostId) return refuse('so-anfitriao');
    if (this.phase !== PHASE_WAITING) return refuse('partida-em-andamento');
    const added: TablePlayer[] = [];
    for (let seat = 0; seat < this.seatCount; seat++) {
      if (seat === keepFree || this.occupant(seat)) continue;
      const id = `${BOT_PREFIX}${++this.botCount}`;
      const bot: TablePlayer = {
        id, name: `Computador ${this.botCount}`, character: this.leastUsedCharacter(),
        seat, settled: false, ready: true, connected: true, bot: true,
      };
      this.players.set(id, bot);
      added.push(bot);
    }
    return added.length ? { result: 'ok', added } : refuse('sem-cadeira-livre');
  }

  /** O anfitrião tira o computador de uma cadeira, só na espera. */
  removeBot(requester: string, seat: number): TableResult {
    if (!this.players.has(requester)) return 'desconhecido';
    if (requester !== this.hostId) return 'so-anfitriao';
    if (this.phase !== PHASE_WAITING) return 'partida-em-andamento';
    const bot = this.occupant(seat);
    if (!bot?.bot) return 'nao-e-computador';
    this.players.delete(bot.id);
    return 'ok';
  }

  private botCount = 0;

  private leastUsedCharacter(): CharacterId {
    const uses = new Map(CHARACTER_IDS.map((c) => [c, 0]));
    for (const p of this.players.values()) uses.set(p.character, (uses.get(p.character) ?? 0) + 1);
    return [...uses].sort((a, b) => a[1] - b[1])[0]![0];
  }

  /**
   * Saída definitiva. No meio da partida, se ainda há gente na mesa, o computador assume a cadeira (a partida
   * guarda as cartas por cadeira, então ele segue com as mesmas) e o jogo continua: devolve esse computador.
   */
  leave(id: string): TablePlayer | null {
    const p = this.players.get(id);
    if (!p) return null;
    this.players.delete(id);
    this.arrivals = this.arrivals.filter((a) => a !== id);
    if (this.phase !== PHASE_PLAYING || p.seat < 0 || p.bot || this.humans().length === 0) return null;
    const n = ++this.botCount;
    const bot: TablePlayer = {
      id: `${BOT_PREFIX}${n}`, name: `Computador ${n}`, character: p.character,
      seat: p.seat, settled: true, ready: true, connected: true, bot: true,
    };
    this.players.set(bot.id, bot);
    return bot;
  }

  occupant(seat: number): TablePlayer | undefined {
    for (const p of this.players.values()) if (p.seat === seat) return p;
    return undefined;
  }

  seatStatus(seat: number): SeatStatus {
    const p = this.occupant(seat);
    if (!p) return SEAT_FREE;
    if (!p.connected) return SEAT_AWAY;
    return p.settled ? SEAT_TAKEN : SEAT_RESERVED;
  }

  setConnected(id: string, connected: boolean): void {
    const p = this.players.get(id);
    if (p) p.connected = connected;
  }

  setCharacter(id: string, character: CharacterId): TableResult {
    const p = this.players.get(id);
    if (!p) return 'desconhecido';
    if (this.phase !== PHASE_WAITING) return 'partida-em-andamento';
    p.character = character;
    return 'ok';
  }

  /** Senta (ou troca de cadeira). A cadeira fica reservada até `settle`. */
  sit(id: string, seat: number): TableResult {
    const p = this.players.get(id);
    if (!p) return 'desconhecido';
    if (this.phase !== PHASE_WAITING) return 'partida-em-andamento';
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.seatCount) return 'cadeira-invalida';
    if (p.seat === seat) return 'ok';
    const occupant = this.occupant(seat);
    // Como numa mesa de verdade, o computador levanta e cede o lugar a quem chega.
    if (occupant?.bot && !p.bot) this.players.delete(occupant.id);
    else if (occupant) return 'cadeira-ocupada';
    p.seat = seat;
    p.settled = false;
    p.ready = false;
    return 'ok';
  }

  /** O personagem chegou: a reserva vira ocupação. Ignorado se ele já mudou de cadeira. */
  settle(id: string, seat: number): void {
    const p = this.players.get(id);
    if (p && p.seat === seat) p.settled = true;
  }

  stand(id: string): TableResult {
    const p = this.players.get(id);
    if (!p) return 'desconhecido';
    if (this.phase !== PHASE_WAITING) return 'partida-em-andamento';
    if (p.seat < 0) return 'nao-sentado';
    p.seat = -1;
    p.settled = false;
    p.ready = false;
    return 'ok';
  }

  setReady(id: string, ready: boolean): TableResult {
    const p = this.players.get(id);
    if (!p) return 'desconhecido';
    if (this.phase !== PHASE_WAITING) return 'partida-em-andamento';
    if (p.seat < 0) return 'nao-sentado';
    if (!p.settled) return 'nao-chegou';
    p.ready = ready;
    return 'ok';
  }

  /** O que ainda impede o começo da partida (sem olhar quem pede); 'ok' se nada. */
  startProblem(): TableResult {
    if (this.phase !== PHASE_WAITING) return 'partida-em-andamento';
    for (let seat = 0; seat < this.seatCount; seat++) {
      if (this.seatStatus(seat) !== SEAT_TAKEN) return 'mesa-incompleta';
    }
    for (const p of this.players.values()) if (p.seat >= 0 && !p.ready) return 'faltam-prontos';
    return 'ok';
  }

  start(id: string): TableResult {
    if (!this.players.has(id)) return 'desconhecido';
    if (id !== this.hostId) return 'so-anfitriao';
    const problem = this.startProblem();
    if (problem !== 'ok') return problem;
    this.phase = PHASE_PLAYING;
    return 'ok';
  }

  end(id: string): TableResult {
    if (!this.players.has(id)) return 'desconhecido';
    if (id !== this.hostId) return 'so-anfitriao';
    if (this.phase !== PHASE_PLAYING) return 'sem-partida';
    this.backToWaiting();
    return 'ok';
  }

  /** Ids sentados na ordem das cadeiras (a ordem de distribuição das cartas). */
  seatedIds(): string[] {
    const ids: string[] = [];
    for (let seat = 0; seat < this.seatCount; seat++) {
      const p = this.occupant(seat);
      if (p) ids.push(p.id);
    }
    return ids;
  }

  private backToWaiting(): void {
    this.phase = PHASE_WAITING;
    // O computador continua pronto; as pessoas confirmam de novo.
    for (const p of this.players.values()) p.ready = p.bot;
  }
}
