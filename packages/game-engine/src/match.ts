import { cardId, parseCardId, sameCard, type Card } from './cards.ts';
import { faltaValue, type SpanishRulesConfig } from './config.ts';
import { deal, seededRandom } from './deal.ts';
import { ENVIDO_CALLS, envidoAccepted, envidoPoints, envidoRefused, nextEnvidoCalls, type EnvidoCall } from './envido.ts';
import { FLOR_RAISES, florPoints, florRefused, florStake, hasFlor, nextFlorRaises, type FlorRaise } from './flor.ts';
import { Scoring, type ScoreEntry } from './scoring.ts';
import { handWinner, resolveTrick, teamOf, type Play, type Team, type TrickOutcome } from './tricks.ts';

/**
 * Uma partida de Truco Espanhol (perfil em `config.ts`), pura e determinística: a mesma semente e as mesmas
 * ações dão o mesmo resultado. A sala do servidor só chama `apply` com o que os jogadores pedem e `nextHand`
 * depois da pausa entre mãos; quem joga, quem ganha e quantos pontos valem sai sempre daqui.
 *
 * Ordem da mesa: a cadeira seguinte (índice + 1) é a da direita. Quem distribui gira para a direita a cada
 * mão, e o mão é quem está à direita de quem distribui.
 *
 * Prioridade das decisões: disputa de Flor > Envido > Truco > vez de jogar. Cada uma só aceita ações da
 * equipe que deve responder; a primeira resposta válida vale e as seguintes já não são legais.
 */

export const TRUCO_CALLS = ['truco', 'retruco', 'vale-quatro'] as const;
export type TrucoCall = (typeof TRUCO_CALLS)[number];

export const ACTION_TYPES = [
  'jogar',
  ...TRUCO_CALLS,
  ...ENVIDO_CALLS,
  'flor',
  ...FLOR_RAISES,
  'quero',
  'nao-quero',
  'me-achico',
  'baralho',
  'contestar',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export interface Action {
  type: ActionType;
  /** Só em 'jogar'. */
  card?: Card;
}

export type ActionError = 'partida-encerrada' | 'mao-encerrada' | 'jogador-fora' | 'acao-invalida' | 'carta-invalida';
export type ApplyResult = { ok: true } | { ok: false; error: ActionError };

export const ACTION_ERROR_TEXT: Record<ActionError, string> = {
  'partida-encerrada': 'A partida já terminou.',
  'mao-encerrada': 'Esta mão já terminou: espere a próxima.',
  'jogador-fora': 'Você foi ao baralho nesta mão.',
  'acao-invalida': 'Agora não dá para fazer isso.',
  'carta-invalida': 'Essa carta não está na sua mão.',
};

export interface EnvidoResult {
  accepted: boolean;
  winnerTeam: Team;
  value: number;
  /** Maior Envido de cada equipe (cantado ao aceitar); null na recusa. */
  best: [number | null, number | null];
  winnerSeat: number | null;
}

export interface FlorResult {
  /** As duas equipes tinham Flor. */
  contested: boolean;
  accepted: boolean;
  winnerTeam: Team;
  value: number;
  best: [number | null, number | null];
}

export interface Trick {
  leader: number;
  plays: Play[];
  outcome: TrickOutcome | null;
  winnerSeat: number | null;
}

export type HandEndReason = 'vazas' | 'recusa' | 'baralho' | 'partida';

interface Pending {
  seat: number;
  team: Team;
}

interface HandState {
  number: number;
  dealer: number;
  mano: number;
  /** Cartas que ainda estão na mão de cada um. */
  cards: Card[][];
  /** As três recebidas (Envido e Flor contam com elas, mesmo depois de jogadas). */
  dealt: Card[][];
  playedFirst: boolean[];
  folded: boolean[];
  tricks: Trick[];
  turn: number;
  truco: { level: number; raiseRight: Team | null; pending: (Pending & { level: number }) | null };
  /** 'queimado': Truco antes do Envido contestado. */
  envido: { status: 'aberto' | 'fechado' | 'resolvido' | 'anulado' | 'queimado'; chain: EnvidoCall[]; pending: Pending | null; result: EnvidoResult | null };
  flor: { status: 'nenhuma' | 'disputa' | 'resolvida'; announced: number[]; chain: FlorRaise[]; pending: Pending | null; result: FlorResult | null };
  /** Truco antes do Envido que a outra equipe ainda pode contestar (só enquanto ela responde a esse Truco). */
  foul: Pending | null;
  /**
   * Conferência no fim da mão: a equipe que perdeu pontos de Envido pode contestar uma Flor escondida até a
   * mão seguinte. `shown`: quem ganhou o Envido aceito mostra as cartas.
   */
  review: { team: Team; shown: { seat: number; cards: Card[] }[] } | null;
  ended: { winnerTeam: Team | null; reason: HandEndReason; value: number } | null;
}

type EventBody =
  | { kind: 'nova-mao'; hand: number; dealer: number; mano: number }
  | { kind: 'carta'; seat: number; card: string; trick: number }
  | { kind: 'canto'; seat: number; call: ActionType }
  | { kind: 'resposta'; seat: number; answer: 'quero' | 'nao-quero' | 'me-achico'; about: 'truco' | 'envido' | 'flor' }
  | { kind: 'vaza'; trick: number; outcome: TrickOutcome; winnerSeat: number | null }
  | { kind: 'envido'; result: EnvidoResult }
  | { kind: 'flor'; result: FlorResult }
  | { kind: 'baralho'; seat: number }
  /** `team`: a equipe contestada; `value`: os tentos que ela perdeu (0 se não procedeu). */
  | { kind: 'contestacao'; seat: number; about: 'truco' | 'flor'; ok: boolean; team: Team; value: number }
  | { kind: 'fim-mao'; winnerTeam: Team | null; reason: HandEndReason; value: number }
  | { kind: 'fim-partida'; winner: Team };
/** Acontecimentos públicos, em ordem, para a mesa animar (cartas, cantos, vazas, pontos). */
export type MatchEvent = EventBody & { id: number };

/** O que está esperando decisão agora. 'conferencia': mão acabada, com uma Flor escondida para contestar. */
export type Decision = 'flor' | 'envido' | 'truco' | 'vez' | 'conferencia' | 'nenhuma';

/** Valores públicos da resposta pendente, calculados com as mesmas funções da pontuação. */
export interface ResponseStakes {
  kind: 'truco' | 'envido' | 'flor';
  accepted: number;
  refused: number;
}

/** Tudo o que é público na partida: vai igual para todos. As cartas na mão de cada um nunca entram aqui. */
export interface MatchView {
  version: number;
  profile: string;
  goal: number;
  flor: boolean;
  seats: number;
  score: [number, number];
  history: ScoreEntry[];
  winner: Team | null;
  hand: {
    number: number;
    dealer: number;
    mano: number;
    turn: number;
    tricks: { leader: number; plays: { seat: number; card: string }[]; outcome: TrickOutcome | null; winnerSeat: number | null }[];
    cardsLeft: number[];
    folded: boolean[];
    truco: { level: number; raiseRight: Team | null; pending: (Pending & { level: number }) | null };
    envido: { status: string; chain: EnvidoCall[]; pending: Pending | null; result: EnvidoResult | null };
    flor: { status: string; announced: number[]; chain: FlorRaise[]; pending: Pending | null; result: FlorResult | null };
    foul: Pending | null;
    /** Só depois do fim da mão: as cartas mostradas são de quem ganhou o Envido. */
    review: { team: Team; shown: { seat: number; cards: string[] }[] } | null;
    decision: Decision;
    /** Opcional para clientes poderem receber estados de servidores anteriores. */
    responseStakes?: ResponseStakes | null;
    /** Quem pode agir agora (a vez, ou quem pode responder ao pedido pendente). */
    actors: number[];
    /** Quanto vale a Falta neste momento. */
    falta: number;
    ended: HandState['ended'];
  } | null;
  events: MatchEvent[];
}

const EVENTS_KEPT = 60;
const TRUCO_NAMES: Record<number, string> = { 1: 'Mão', 2: 'Truco', 3: 'Retruco', 4: 'Vale Quatro' };
const ENVIDO_NAMES: Record<EnvidoCall, string> = { envido: 'Envido', 'real-envido': 'Real Envido', 'falta-envido': 'Falta Envido' };

const other = (team: Team): Team => (team === 0 ? 1 : 0);

export class SpanishMatch {
  readonly config: SpanishRulesConfig;
  readonly seats: number;
  readonly scoring: Scoring;
  /** Sobe a cada ação aplicada e a cada mão nova: o cliente manda a versão que viu, e ação velha é recusada. */
  version = 0;
  private hand: HandState | null = null;
  private dealer = -1;
  private readonly random: () => number;
  private readonly events: MatchEvent[] = [];
  private eventId = 0;

  constructor(config: SpanishRulesConfig, seats: 2 | 4, seed: number) {
    this.config = config;
    this.seats = seats;
    this.scoring = new Scoring(config.goal);
    this.random = seededRandom(seed);
  }

  get winner(): Team | null {
    return this.scoring.winner;
  }

  get handOver(): boolean {
    return this.hand?.ended != null;
  }

  /** Começa a mão seguinte. `rigged` (só testes) fixa as cartas de cada cadeira. */
  startHand(rigged?: Card[][]): void {
    if (this.winner !== null) return;
    this.dealer = this.dealer < 0 ? Math.floor(this.random() * this.seats) : (this.dealer + 1) % this.seats;
    const mano = (this.dealer + 1) % this.seats;
    const hands = rigged ?? deal(this.seats, Math.floor(this.random() * 2 ** 31)).hands;
    const number = (this.hand?.number ?? 0) + 1;
    this.hand = {
      number,
      dealer: this.dealer,
      mano,
      cards: hands.map((h) => [...h]),
      dealt: hands.map((h) => [...h]),
      playedFirst: hands.map(() => false),
      folded: hands.map(() => false),
      tricks: [{ leader: mano, plays: [], outcome: null, winnerSeat: null }],
      turn: mano,
      truco: { level: 1, raiseRight: null, pending: null },
      envido: { status: 'aberto', chain: [], pending: null, result: null },
      flor: { status: 'nenhuma', announced: [], chain: [], pending: null, result: null },
      foul: null,
      review: null,
      ended: null,
    };
    this.emit({ kind: 'nova-mao', hand: number, dealer: this.dealer, mano });
    this.version++;
  }

  /** Depois da pausa entre mãos. Não faz nada se a mão não acabou ou se a partida acabou. */
  nextHand(): void {
    if (this.hand?.ended && this.winner === null) this.startHand();
  }

  handOf(seat: number): Card[] {
    return [...(this.hand?.cards[seat] ?? [])];
  }

  dealtOf(seat: number): Card[] {
    return [...(this.hand?.dealt[seat] ?? [])];
  }

  /** Só para testes: muda o dealer da primeira mão (a próxima `startHand` usa dealer + 1). */
  setDealerForTests(dealer: number): void {
    this.dealer = (dealer - 1 + this.seats) % this.seats;
  }

  // ------------------------------------------------------------------ consultas

  private active(seat: number): boolean {
    return !!this.hand && !this.hand.folded[seat];
  }

  private nextActive(seat: number): number {
    for (let k = 1; k <= this.seats; k++) {
      const s = (seat + k) % this.seats;
      if (this.active(s)) return s;
    }
    return seat;
  }

  /** As cadeiras a partir do mão, na ordem de jogo: é a ordem de prioridade nos desempates. */
  private orderFromMano(): number[] {
    const mano = this.hand!.mano;
    return Array.from({ length: this.seats }, (_, k) => (mano + k) % this.seats);
  }

  private activeOf(team: Team): number[] {
    return this.orderFromMano().filter((s) => teamOf(s) === team && this.active(s));
  }

  /**
   * Quem tem Flor pode anunciá-la até jogar a primeira carta, enquanto o Envido não se resolveu. Não é
   * obrigatória: escondê-la para jogar o Envido vale, mas a outra equipe pode contestar no fim da mão.
   */
  private canAnnounceFlor(seat: number): boolean {
    const h = this.hand!;
    return this.config.flor && h.flor.status === 'nenhuma' && h.envido.status !== 'resolvido' && this.active(seat) && !h.playedFirst[seat] && hasFlor(h.dealt[seat]!);
  }

  private unannouncedFlores(): number[] {
    return this.orderFromMano().filter((s) => this.canAnnounceFlor(s));
  }

  private currentTrick(): Trick {
    const h = this.hand!;
    return h.tricks[h.tricks.length - 1]!;
  }

  /** Pode abrir o Envido agora? (como canto na própria vez ou como resposta ao primeiro Truco) */
  private canOpenEnvido(seat: number): boolean {
    const h = this.hand!;
    const e = h.envido;
    if (e.status !== 'aberto' || e.pending || h.flor.announced.length > 0 || h.truco.level > 1) return false;
    if (h.tricks.length !== 1 || h.playedFirst[seat]) return false;
    return this.envidoOpenerByPosition(seat);
  }

  /** Na mesa de 4, só os dois últimos da ordem da primeira vaza abrem o Envido; no mano a mano, os dois. */
  private envidoOpenerByPosition(seat: number): boolean {
    if (this.seats !== 4 || this.config.envidoOpenersFour !== 'ultimos-dois') return true;
    const pos = (seat - this.hand!.mano + this.seats) % this.seats;
    return pos >= this.seats - 2;
  }

  /**
   * Pedir Truco agora seria Truco antes do Envido? Na primeira vaza, com o Envido ainda aberto, a equipe do
   * mão pede o primeiro Truco antes de a outra ter tido a vez de cantar o Envido (nenhum dos que podem abri-lo
   * jogou ainda). A outra equipe pode contestar enquanto responde.
   */
  trucoBeforeEnvido(seat: number): boolean {
    const h = this.hand;
    if (!h || h.ended || h.truco.level !== 1 || h.tricks.length !== 1 || h.envido.status !== 'aberto') return false;
    const team = teamOf(seat);
    if (team !== teamOf(h.mano)) return false;
    const openers = this.orderFromMano().filter((s) => teamOf(s) !== team && this.envidoOpenerByPosition(s));
    return openers.some((s) => this.active(s) && !h.playedFirst[s]) && !openers.some((s) => h.playedFirst[s]);
  }

  private decision(): Decision {
    const h = this.hand;
    if (!h || this.winner !== null) return 'nenhuma';
    if (h.ended) return h.review ? 'conferencia' : 'nenhuma';
    if (h.flor.pending) return 'flor';
    if (h.envido.pending) return 'envido';
    if (h.truco.pending) return 'truco';
    return 'vez';
  }

  /** Quem pode agir agora. */
  actors(): number[] {
    const h = this.hand;
    switch (this.decision()) {
      case 'flor':
        return this.activeOf(other(h!.flor.pending!.team));
      case 'envido':
        return this.activeOf(other(h!.envido.pending!.team));
      case 'truco':
        return this.activeOf(other(h!.truco.pending!.team));
      case 'vez':
        return [h!.turn];
      case 'conferencia':
        // A mão acabou: contesta qualquer um da equipe, mesmo quem foi ao baralho.
        return this.orderFromMano().filter((s) => teamOf(s) === h!.review!.team);
      default:
        return [];
    }
  }

  /** Todas as ações legais desta cadeira agora (uma por carta em 'jogar'). É a única fonte de verdade da validação. */
  legalActions(seat: number): Action[] {
    const h = this.hand;
    if (!h) return [];
    const team = teamOf(seat);
    const decision = this.decision();
    if (decision === 'conferencia') return team === h.review!.team ? [{ type: 'contestar' }] : [];
    if (h.ended || this.winner !== null || h.folded[seat]) return [];
    const only = (...types: ActionType[]): Action[] => types.map((type) => ({ type }));
    switch (decision) {
      case 'flor': {
        if (team === h.flor.pending!.team) return [];
        return only('quero', 'me-achico', ...nextFlorRaises(h.flor.chain));
      }
      case 'envido': {
        if (team === h.envido.pending!.team) return [];
        const out = only('quero', 'nao-quero', ...nextEnvidoCalls(h.envido.chain));
        // Responder com a Flor anula o Envido.
        if (this.canAnnounceFlor(seat)) out.push({ type: 'flor' });
        out.push({ type: 'baralho' });
        return out;
      }
      case 'truco': {
        const p = h.truco.pending!;
        if (team === p.team) return [];
        const out = only('quero', 'nao-quero');
        if (p.level < 4) out.push({ type: TRUCO_CALLS[p.level - 1]! });
        if (p.level === 2 && this.canOpenEnvido(seat)) out.push(...only(...ENVIDO_CALLS));
        if (this.canAnnounceFlor(seat)) out.push({ type: 'flor' });
        if (h.foul) out.push({ type: 'contestar' });
        out.push({ type: 'baralho' });
        return out;
      }
      case 'vez': {
        if (seat !== h.turn) return [];
        const out: Action[] = h.cards[seat]!.map((card) => ({ type: 'jogar', card }));
        const t = h.truco;
        if (t.level < 4 && (t.raiseRight === null || t.raiseRight === team)) out.push({ type: TRUCO_CALLS[t.level - 1]! });
        if (this.canOpenEnvido(seat)) out.push(...only(...ENVIDO_CALLS));
        if (this.canAnnounceFlor(seat)) out.push({ type: 'flor' });
        out.push({ type: 'baralho' });
        return out;
      }
      default:
        return [];
    }
  }

  // ------------------------------------------------------------------ ações

  apply(seat: number, action: Action): ApplyResult {
    if (this.winner !== null) return { ok: false, error: 'partida-encerrada' };
    const h = this.hand;
    if (!h || (h.ended && (!h.review || action.type !== 'contestar'))) return { ok: false, error: 'mao-encerrada' };
    if (seat < 0 || seat >= this.seats) return { ok: false, error: 'acao-invalida' };
    if (!h.ended && h.folded[seat]) return { ok: false, error: 'jogador-fora' };
    const legal = this.legalActions(seat);
    const match = legal.find((a) => a.type === action.type && (a.type !== 'jogar' || (action.card && sameCard(a.card!, action.card))));
    if (!match) return { ok: false, error: action.type === 'jogar' && legal.some((a) => a.type === 'jogar') ? 'carta-invalida' : 'acao-invalida' };
    this.perform(seat, match);
    this.resumeTurn();
    this.version++;
    return { ok: true };
  }

  /**
   * A vez parada em quem foi ao baralho com uma resposta pendente (Flor, Envido ou Truco) só anda depois que
   * a resposta se resolve: fechar a vaza antes tiraria do parceiro o direito de responder.
   */
  private resumeTurn(): void {
    const h = this.hand!;
    if (h.ended || h.flor.pending || h.envido.pending || h.truco.pending || this.active(h.turn)) return;
    if (this.trickComplete()) this.finishTrick();
    else h.turn = this.nextActive(h.turn);
  }

  private perform(seat: number, action: Action): void {
    const h = this.hand!;
    const team = teamOf(seat);
    // Responder ao Truco sem contestar deixa passar o Truco antes do Envido.
    if (action.type !== 'contestar') h.foul = null;
    switch (action.type) {
      case 'jogar':
        return this.playCard(seat, action.card!);
      case 'flor':
        return this.announceFlores(seat);
      case 'contestar':
        return h.ended ? this.contestFlor(seat) : this.contestTruco(seat);
      case 'truco':
      case 'retruco':
      case 'vale-quatro': {
        if (h.truco.pending) this.acceptTruco();
        if (action.type === 'truco' && this.trucoBeforeEnvido(seat)) h.foul = { seat, team };
        h.truco.pending = { seat, team, level: h.truco.level + 1 };
        this.emit({ kind: 'canto', seat, call: action.type });
        return;
      }
      case 'envido':
      case 'real-envido':
      case 'falta-envido': {
        if (h.envido.pending) {
          h.envido.chain.push(action.type);
          h.envido.pending = { seat, team };
          this.emit({ kind: 'canto', seat, call: action.type });
          return;
        }
        h.envido.chain = [action.type];
        h.envido.pending = { seat, team };
        this.emit({ kind: 'canto', seat, call: action.type });
        return;
      }
      case 'contra-flor':
      case 'contra-flor-resto':
        h.flor.chain.push(action.type);
        h.flor.pending = { seat, team };
        this.emit({ kind: 'canto', seat, call: action.type });
        return;
      case 'quero':
        if (h.flor.pending) {
          this.emit({ kind: 'resposta', seat, answer: 'quero', about: 'flor' });
          return this.resolveFlor(true);
        }
        if (h.envido.pending) {
          this.emit({ kind: 'resposta', seat, answer: 'quero', about: 'envido' });
          return this.resolveEnvido(true);
        }
        this.emit({ kind: 'resposta', seat, answer: 'quero', about: 'truco' });
        return this.acceptTruco();
      case 'nao-quero':
        if (h.envido.pending) {
          this.emit({ kind: 'resposta', seat, answer: 'nao-quero', about: 'envido' });
          return this.resolveEnvido(false);
        }
        this.emit({ kind: 'resposta', seat, answer: 'nao-quero', about: 'truco' });
        return this.refuseTruco();
      case 'me-achico':
        this.emit({ kind: 'resposta', seat, answer: 'me-achico', about: 'flor' });
        return this.resolveFlor(false);
      case 'baralho':
        return this.fold(seat);
    }
  }

  private playCard(seat: number, card: Card): void {
    const h = this.hand!;
    h.cards[seat] = h.cards[seat]!.filter((c) => !sameCard(c, card));
    h.playedFirst[seat] = true;
    const trick = this.currentTrick();
    trick.plays.push({ seat, card });
    this.emit({ kind: 'carta', seat, card: cardId(card), trick: h.tricks.length - 1 });
    if (this.trickComplete()) this.finishTrick();
    else h.turn = this.nextActive(seat);
  }

  private trickComplete(): boolean {
    const played = new Set(this.currentTrick().plays.map((p) => p.seat));
    for (let s = 0; s < this.seats; s++) if (this.active(s) && !played.has(s)) return false;
    return true;
  }

  private finishTrick(): void {
    const h = this.hand!;
    const trick = this.currentTrick();
    const { outcome, winnerSeat } = resolveTrick(trick.plays);
    trick.outcome = outcome;
    trick.winnerSeat = winnerSeat;
    this.emit({ kind: 'vaza', trick: h.tricks.length - 1, outcome, winnerSeat });
    // Acabou a primeira vaza: acabou o direito ao Envido.
    if (h.tricks.length === 1 && h.envido.status === 'aberto') h.envido.status = 'fechado';
    const winner = handWinner(h.tricks.map((t) => t.outcome!), teamOf(h.mano));
    if (winner !== null) {
      const value = h.truco.level;
      this.scoring.award(`${h.number}:mao`, h.number, 'truco', h.truco.level > 1 ? `${TRUCO_NAMES[value]} ganho` : 'Mão ganha', winner, value);
      return this.endHand(winner, 'vazas', value);
    }
    // Parda: abre o mão (ou o próximo ativo depois dele). Senão, quem ganhou a vaza.
    let leader = winnerSeat ?? h.mano;
    if (!this.active(leader)) leader = this.nextActive(leader);
    h.tricks.push({ leader, plays: [], outcome: null, winnerSeat: null });
    h.turn = leader;
  }

  private acceptTruco(): void {
    const t = this.hand!.truco;
    const p = t.pending!;
    t.level = p.level;
    t.raiseRight = other(p.team);
    t.pending = null;
    // Truco aceito sem cantar o Envido: o direito ao Envido se perde.
    if (this.hand!.envido.status === 'aberto') this.hand!.envido.status = 'fechado';
  }

  private refuseTruco(): void {
    const h = this.hand!;
    const p = h.truco.pending!;
    const value = h.truco.level;
    h.truco.pending = null;
    this.scoring.award(`${h.number}:mao`, h.number, 'truco', `${TRUCO_NAMES[p.level]} recusado`, p.team, value);
    this.endHand(p.team, 'recusa', value);
  }

  /** Melhor pontuação de cada equipe e quem ganha (empate: quem vem primeiro a partir do mão). */
  private compare(points: (seat: number) => number | null): { winnerTeam: Team; winnerSeat: number; best: [number | null, number | null] } {
    const best: [number | null, number | null] = [null, null];
    let top = -1;
    let winnerSeat = -1;
    for (const s of this.orderFromMano()) {
      const v = points(s);
      if (v === null) continue;
      const t = teamOf(s);
      if (best[t] === null || v > best[t]!) best[t] = v;
      if (v > top) {
        top = v;
        winnerSeat = s;
      }
    }
    return { winnerTeam: teamOf(winnerSeat), winnerSeat, best };
  }

  private resolveEnvido(accepted: boolean): void {
    const h = this.hand!;
    const e = h.envido;
    const p = e.pending!;
    const name = e.chain.map((c) => ENVIDO_NAMES[c]).join(' + ');
    let result: EnvidoResult;
    if (accepted) {
      const value = envidoAccepted(this.config, e.chain, faltaValue(this.config, this.scoring.score));
      const c = this.compare((s) => (this.active(s) ? envidoPoints(h.dealt[s]!) : null));
      result = { accepted, winnerTeam: c.winnerTeam, value, best: c.best, winnerSeat: c.winnerSeat };
    } else {
      result = { accepted, winnerTeam: p.team, value: envidoRefused(this.config, e.chain), best: [null, null], winnerSeat: null };
    }
    e.pending = null;
    e.status = 'resolvido';
    e.result = result;
    this.emit({ kind: 'envido', result });
    this.scoring.award(`${h.number}:envido`, h.number, 'envido', accepted ? name : `${name} recusado`, result.winnerTeam, result.value);
    this.checkMatchEnd();
  }

  /**
   * Anuncia as Flores da mão, todas de uma vez (as de quem ainda não jogou a primeira carta saem juntas):
   * sem oposição, pontua na hora; com Flor dos dois lados, abre a disputa.
   */
  private announceFlores(trigger: number): void {
    const h = this.hand!;
    const holders = this.unannouncedFlores();
    if (!holders.includes(trigger)) trigger = holders[0]!;
    h.flor.announced = holders;
    for (const s of holders) this.emit({ kind: 'canto', seat: s, call: 'flor' });
    // A Flor anula o Envido da mão (e um Envido pendente sai sem pontos).
    h.envido.pending = null;
    h.envido.chain = [];
    if (h.envido.status === 'aberto' || h.envido.status === 'fechado') h.envido.status = 'anulado';
    const teams = new Set(holders.map(teamOf));
    if (teams.size === 1) {
      const team = teamOf(holders[0]!);
      const value = this.config.florValues.perFlor * holders.length;
      const result: FlorResult = { contested: false, accepted: true, winnerTeam: team, value, best: [null, null] };
      h.flor.status = 'resolvida';
      h.flor.result = result;
      this.emit({ kind: 'flor', result });
      this.scoring.award(`${h.number}:flor`, h.number, 'flor', holders.length > 1 ? `${holders.length} Flores` : 'Flor', team, value);
      return this.checkMatchEnd();
    }
    h.flor.status = 'disputa';
    h.flor.pending = { seat: trigger, team: teamOf(trigger) };
  }

  private resolveFlor(accepted: boolean): void {
    const h = this.hand!;
    const f = h.flor;
    const p = f.pending!;
    const falta = faltaValue(this.config, this.scoring.score);
    const flores = f.announced.length;
    const last = f.chain[f.chain.length - 1];
    let result: FlorResult;
    if (accepted) {
      const c = this.compare((s) => (f.announced.includes(s) ? florPoints(h.dealt[s]!) : null));
      result = { contested: true, accepted, winnerTeam: c.winnerTeam, value: florStake(this.config, flores, f.chain, falta), best: c.best };
    } else {
      result = { contested: true, accepted, winnerTeam: p.team, value: florRefused(this.config, flores, f.chain, falta), best: [null, null] };
    }
    f.pending = null;
    f.status = 'resolvida';
    f.result = result;
    this.emit({ kind: 'flor', result });
    const detail = last === 'contra-flor-resto' ? 'Contra-Flor e o Resto' : last === 'contra-flor' ? 'Contra-Flor' : 'Flor contra Flor';
    this.scoring.award(`${h.number}:flor`, h.number, 'flor', accepted ? detail : `${detail} (me achico)`, result.winnerTeam, result.value);
    this.checkMatchEnd();
  }

  /**
   * Ir ao baralho: o jogador larga as cartas. Na dupla, o parceiro segue com as dele; se a equipe toda foi
   * ao baralho, ela desiste da mão: um Envido ou uma Flor que ela devia responder conta como recusa, e a
   * outra equipe leva o valor do Truco já estabelecido.
   */
  private fold(seat: number): void {
    const h = this.hand!;
    const team = teamOf(seat);
    h.folded[seat] = true;
    h.cards[seat] = [];
    this.emit({ kind: 'baralho', seat });
    if (this.activeOf(team).length === 0) {
      if (h.flor.pending && h.flor.pending.team !== team) this.resolveFlor(false);
      if (h.envido.pending && h.envido.pending.team !== team) this.resolveEnvido(false);
      if (this.winner !== null) return;
      const value = h.truco.level;
      h.truco.pending = null;
      this.scoring.award(`${h.number}:mao`, h.number, 'truco', 'Ir ao baralho', other(team), value);
      return this.endHand(other(team), 'baralho', value);
    }
    // Se era a vez dele, ela segue em `resumeTurn`, depois de qualquer resposta pendente.
  }

  /** Truco antes do Envido contestado: o Envido da mão queima e a equipe infratora perde os tentos da penalidade. */
  private contestTruco(seat: number): void {
    const h = this.hand!;
    const foul = h.foul!;
    h.foul = null;
    h.envido.status = 'queimado';
    const value = this.scoring.penalize(`${h.number}:truco-antes-envido`, h.number, 'Truco antes do Envido', foul.team, this.config.trucoBeforeEnvidoPenalty);
    this.emit({ kind: 'contestacao', seat, about: 'truco', ok: true, team: foul.team, value });
  }

  /**
   * Flor escondida contestada na conferência: procede se alguém da equipe que levou o Envido tinha Flor, não
   * a anunciou e as três cartas dele ficaram à vista (mostradas no fim ou jogadas). Aí os pontos do Envido
   * passam para quem contestou. Contestação sem Flor à vista não muda nada.
   */
  private contestFlor(seat: number): void {
    const h = this.hand!;
    const review = h.review!;
    h.review = null;
    const r = h.envido.result!;
    const offender = r.winnerTeam;
    if (!this.hiddenFlorSeen(offender, review)) {
      this.emit({ kind: 'contestacao', seat, about: 'flor', ok: false, team: offender, value: 0 });
      return;
    }
    const value = this.scoring.penalize(`${h.number}:flor-escondida`, h.number, 'Flor escondida', offender, r.value);
    this.scoring.award(`${h.number}:flor-contestada`, h.number, 'contestacao', 'Flor escondida contestada', other(offender), r.value);
    this.emit({ kind: 'contestacao', seat, about: 'flor', ok: true, team: offender, value });
    if (this.winner !== null) this.emit({ kind: 'fim-partida', winner: this.winner });
  }

  private hiddenFlorSeen(team: Team, review: NonNullable<HandState['review']>): boolean {
    const h = this.hand!;
    return this.orderFromMano().some((s) => {
      if (teamOf(s) !== team || h.flor.announced.includes(s) || !hasFlor(h.dealt[s]!)) return false;
      const played = h.tricks.reduce((n, t) => n + t.plays.filter((p) => p.seat === s).length, 0);
      return played === 3 || review.shown.some((x) => x.seat === s);
    });
  }

  /**
   * Abre a conferência quando uma equipe levou pontos de Envido e a Flor está ligada (aconteça ou não uma Flor
   * escondida, para a conferência não denunciar nada). Quem ganhou o Envido aceito mostra as três cartas.
   */
  private openReview(): HandState['review'] {
    const h = this.hand!;
    const r = h.envido.result;
    if (!this.config.flor || this.winner !== null || !r) return null;
    const shown = r.accepted && r.winnerSeat !== null ? [{ seat: r.winnerSeat, cards: [...h.dealt[r.winnerSeat]!] }] : [];
    return { team: other(r.winnerTeam), shown };
  }

  private checkMatchEnd(): void {
    if (this.winner !== null && !this.hand!.ended) this.endHand(null, 'partida', 0);
  }

  private endHand(winnerTeam: Team | null, reason: HandEndReason, value: number): void {
    const h = this.hand!;
    if (h.ended) return;
    h.ended = { winnerTeam, reason, value };
    h.truco.pending = null;
    h.envido.pending = null;
    h.flor.pending = null;
    h.foul = null;
    h.review = this.openReview();
    this.emit({ kind: 'fim-mao', winnerTeam, reason, value });
    if (this.winner !== null) this.emit({ kind: 'fim-partida', winner: this.winner });
  }

  private emit(body: EventBody): void {
    this.events.push({ ...body, id: ++this.eventId });
    if (this.events.length > EVENTS_KEPT) this.events.shift();
  }

  // ------------------------------------------------------------------ visão pública

  private responseStakes(): ResponseStakes | null {
    const h = this.hand;
    if (!h || h.ended || this.winner !== null) return null;
    const kind = this.decision();
    const falta = faltaValue(this.config, this.scoring.score);
    if (kind === 'truco') return { kind, accepted: h.truco.pending!.level, refused: h.truco.level };
    if (kind === 'envido') return {
      kind,
      accepted: envidoAccepted(this.config, h.envido.chain, falta),
      refused: envidoRefused(this.config, h.envido.chain),
    };
    if (kind === 'flor') return {
      kind,
      accepted: florStake(this.config, h.flor.announced.length, h.flor.chain, falta),
      refused: florRefused(this.config, h.flor.announced.length, h.flor.chain, falta),
    };
    return null;
  }

  view(): MatchView {
    const h = this.hand;
    return {
      version: this.version,
      profile: this.config.profile,
      goal: this.config.goal,
      flor: this.config.flor,
      seats: this.seats,
      score: [this.scoring.score[0], this.scoring.score[1]],
      history: this.scoring.history.map((e) => ({ ...e, score: [e.score[0], e.score[1]] })),
      winner: this.winner,
      hand: h && {
        number: h.number,
        dealer: h.dealer,
        mano: h.mano,
        turn: h.turn,
        tricks: h.tricks.map((t) => ({
          leader: t.leader,
          plays: t.plays.map((p) => ({ seat: p.seat, card: cardId(p.card) })),
          outcome: t.outcome,
          winnerSeat: t.winnerSeat,
        })),
        cardsLeft: h.cards.map((c) => c.length),
        folded: [...h.folded],
        truco: { level: h.truco.level, raiseRight: h.truco.raiseRight, pending: h.truco.pending && { ...h.truco.pending } },
        envido: { status: h.envido.status, chain: [...h.envido.chain], pending: h.envido.pending && { ...h.envido.pending }, result: h.envido.result },
        flor: {
          status: h.flor.status,
          announced: [...h.flor.announced],
          chain: [...h.flor.chain],
          pending: h.flor.pending && { ...h.flor.pending },
          result: h.flor.result,
        },
        foul: h.foul && { ...h.foul },
        review: h.review && { team: h.review.team, shown: h.review.shown.map((x) => ({ seat: x.seat, cards: x.cards.map(cardId) })) },
        decision: this.decision(),
        responseStakes: this.responseStakes(),
        actors: this.actors(),
        falta: faltaValue(this.config, this.scoring.score),
        ended: h.ended && { ...h.ended },
      },
      events: [...this.events],
    };
  }
}

/** Valida a ação vinda da rede: `{ type, card? }`. Qualquer outro formato devolve null. */
export function parseAction(raw: unknown): Action | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!(ACTION_TYPES as readonly unknown[]).includes(r.type)) return null;
  const type = r.type as ActionType;
  if (type !== 'jogar') return r.card === undefined ? { type } : null;
  const card = parseCardId(r.card);
  return card ? { type, card } : null;
}
