import { randomInt } from 'node:crypto';
import { Room, matchMaker, type Client } from '@colyseus/core';
import {
  ACTION_ERROR_TEXT,
  SpanishMatch,
  summarizeHand,
  type HandSummary,
  botAction,
  botContests,
  cardId,
  gauderio,
  parseAction,
  seededRandom,
  type Action,
} from '@trukenza/game-engine';
import {
  CLOSE_IDLE,
  DEFAULT_CHARACTER,
  IDLE_MINUTES,
  MSG_ACTION,
  MSG_SCENERY,
  DEFAULT_SCENERY,
  parseScenery,
  parseSceneryMessage,
  MSG_SIGNAL,
  MSG_TABLE_SIGNAL,
  SIGNAL_COOLDOWN_MS,
  parseSignalRequest,
  MSG_ADD_BOTS,
  MSG_CHARACTER,
  MSG_END,
  MSG_HAND,
  MSG_REMATCH,
  MSG_REMATCH_READY,
  MSG_REMOVE_BOT,
  MSG_READY,
  MSG_REFUSED,
  MSG_RULES,
  MSG_SIT,
  MSG_STAND,
  MSG_START,
  PHASE_PLAYING,
  REFUSAL_TEXT,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SIT_MS,
  Table,
  parseActionVersion,
  parseCharacter,
  parseCharacterMessage,
  parseName,
  parseReadyMessage,
  parseRules,
  parseSeatCount,
  parseSitMessage,
  placeholderName,
  type CreateRoomOptions,
  type HandMessage,
  type JoinOptions,
  type RoomSummary,
  type TableResult,
} from '@trukenza/shared';
import { processMetrics } from './metrics.ts';
import { PlayerSchema, SeatSchema, TableState } from './state.ts';
import { SignalMemory } from './signalMemory.ts';

function randomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

const STALE_ACTION = 'A mesa mudou antes da sua jogada: confira e jogue de novo.';
const NO_MATCH = 'Não há partida em andamento.';
const NOT_SEATED = 'Só quem está sentado joga.';

type Timer = ReturnType<Room['clock']['setTimeout']>;

/**
 * Uma mesa de truco. Autoritativa: o cliente só pede (sentar, pronto, começar, jogar, cantar, responder) e a
 * sala decide pela `Table` (cadeiras) e pela `SpanishMatch` (regras). As mensagens são tratadas uma por vez.
 *
 * - O estado público da partida vai em `state.game` (JSON da `MatchView`); as cartas de cada um e o que ele
 *   pode fazer vão só para o dono (`MSG_HAND`).
 * - Toda jogada leva a versão do estado que o jogador viu; versão diferente da atual é recusada.
 * - O computador age com um pequeno atraso; quem deixa o tempo acabar, ou caiu, tem a jogada feita pelo
 *   computador; quem sai de vez é substituído por ele na mesma cadeira.
 */
export class MesaRoom extends Room<{ state: TableState }> {
  /** Salas abertas neste processo, para a lista do lobby. */
  static rooms = new Set<MesaRoom>();
  /** Segundos de cadeira guardada depois de uma queda de conexão. */
  protected readonly reconnectSeconds: number = 60;
  /** Caminhada até a cadeira; os testes encurtam. */
  protected readonly sitMs: number = SIT_MS;
  /** Sem nenhuma mensagem por este tempo, a sala fecha: uma mesa esquecida não ocupa vaga para sempre. */
  protected readonly idleSeconds: number = IDLE_MINUTES * 60;
  /** Quanto o computador "pensa" antes de agir (mínimo e máximo, em ms). */
  protected readonly botDelayMs: readonly [number, number] = [900, 1800];
  /** Pausa entre uma mão e a seguinte: ver o resultado e recolher as cartas. */
  protected readonly handPauseMs: number = 3500;
  /** Pausa entre mãos quando há conferência (Flor escondida para contestar). */
  protected readonly reviewPauseMs: number = 9000;
  /** Quem caiu: depois disto o computador joga por ele (a cadeira continua guardada). */
  protected readonly droppedGraceMs: number = 12_000;
  /** Duração de um "segundo" do tempo de jogada (os testes encurtam). */
  protected readonly secondMs: number = 1000;
  private table!: Table;
  private lastHandSummary: HandSummary | null = null;
  private open = false;
  /** Mesa contra o computador: ele ocupa as outras cadeiras quando o anfitrião chega. */
  private vsComputer = false;
  private joined = 0;
  private match: SpanishMatch | null = null;
  private readonly botRandom = seededRandom(randomInt(2 ** 31));
  private decisionTimer: Timer | null = null;
  /** Quando acaba o tempo de quem decide agora (0 = sem relógio na tela), e de quanto era esse tempo. */
  private deadline = 0;
  private deadlineMs = 0;
  /**
   * Prazo absoluto da decisão desta versão (relógio de quem decide ou pausa entre mãos). Queda e volta de
   * alguém reagendam a decisão sem mudar a versão: o prazo continua o mesmo, não recomeça inteiro.
   */
  private due: { match: SpanishMatch; version: number; kind: 'relogio' | 'pausa'; at: number } | null = null;
  private idleTimer: Timer | null = null;
  private signalId = 0;
  private signalAt = new Map<string, number>();
  private readonly observedSignals = new SignalMemory();

  async onCreate(options: CreateRoomOptions = {}): Promise<void> {
    let code = randomCode();
    while ((await matchMaker.query({ roomId: code })).length > 0) code = randomCode();
    this.roomId = code;

    const seats = parseSeatCount(options.seats);
    this.maxClients = seats;
    // Pedidos de pessoas, não de quadros: 20 por segundo já é muito.
    this.maxMessagesPerSecond = 20;
    // Só `true` abre a sala: sem o campo, ela é privada.
    this.open = options.open === true;
    // A privada sai também do matchmaking por nome (join/joinOrCreate): só entra quem tem o código (joinById).
    await this.setPrivate(!this.open);
    this.vsComputer = options.bots === true;
    this.table = new Table(seats, parseRules(options.rules), parseScenery(options.scenery) ?? DEFAULT_SCENERY);

    const state = new TableState();
    state.seatCount = seats;
    state.game = '';
    for (let i = 0; i < seats; i++) state.seats.push(new SeatSchema());
    this.state = state;
    this.sync();

    this.handle(MSG_CHARACTER, (id, raw) => {
      const character = parseCharacterMessage(raw);
      return character ? this.table.setCharacter(id, character) : null;
    });
    this.handle(MSG_SIT, (id, raw) => {
      const seat = parseSitMessage(raw);
      if (seat === null) return null;
      const result = this.table.sit(id, seat);
      if (result === 'ok' && !this.table.players.get(id)!.settled) this.walkIn(id, seat);
      return result;
    });
    this.handle(MSG_STAND, (id) => this.table.stand(id));
    this.handle(MSG_ADD_BOTS, (id) => this.addBots(id));
    this.handle(MSG_REMOVE_BOT, (id, raw) => {
      const seat = parseSitMessage(raw);
      return seat === null ? null : this.table.removeBot(id, seat);
    });
    this.handle(MSG_READY, (id, raw) => {
      const ready = parseReadyMessage(raw);
      return ready === null ? null : this.table.setReady(id, ready);
    });
    this.handle(MSG_REMATCH_READY, (id, raw) => {
      const ready = parseReadyMessage(raw);
      return ready === null ? null : this.table.setRematchReady(id, ready);
    });
    this.handle(MSG_RULES, (id, raw) => this.table.setRules(id, parseRules(raw, this.table.rules)));
    this.handle(MSG_SCENERY, (id, raw) => {
      const scenery = parseSceneryMessage(raw);
      return scenery ? this.table.setScenery(id, scenery) : null;
    });
    this.handle(MSG_START, (id) => {
      const result = this.table.start(id);
      if (result === 'ok') this.startMatch();
      return result;
    });
    this.handle(MSG_REMATCH, (id) => {
      if (id !== this.table.hostId) return 'so-anfitriao';
      if (!this.match || this.table.phase !== PHASE_PLAYING) return 'sem-partida';
      if (this.match.winner === null) return 'partida-em-andamento';
      const result = this.table.rematch(id);
      if (result !== 'ok') return result;
      this.startMatch();
      return 'ok';
    });
    this.handle(MSG_END, (id) => {
      const result = this.table.end(id);
      if (result === 'ok') this.stopMatch();
      return result;
    });
    this.onMessage(MSG_ACTION, (client, raw) => this.receiveAction(client, raw));
    this.onMessage(MSG_SIGNAL, (client, raw) => this.receiveSignal(client, raw));

    this.touch();
    processMetrics.rooms++;
    MesaRoom.rooms.add(this);
  }

  onDispose(): void {
    processMetrics.rooms--;
    MesaRoom.rooms.delete(this);
  }

  /**
   * Registra um pedido do cliente. `apply` devolve o resultado da mesa, ou null para mensagem fora do
   * formato (descartada em silêncio). Recusas viram um aviso só para quem pediu.
   */
  private handle(type: string, apply: (id: string, raw: unknown) => TableResult | null): void {
    this.onMessage(type, (client, raw) => {
      this.touch();
      const result = apply(client.sessionId, raw);
      if (result === null) return;
      if (result === 'ok') this.sync();
      else client.send(MSG_REFUSED, { text: REFUSAL_TEXT[result] });
    });
  }

  /** A cadeira fica reservada enquanto o personagem caminha; depois, ocupada. */
  private walkIn(id: string, seat: number): void {
    this.clock.setTimeout(() => {
      this.table.settle(id, seat);
      this.sync();
    }, this.sitMs);
  }

  private addBots(requester: string, keepFree = -1): TableResult {
    const { result, added } = this.table.addBots(requester, keepFree);
    for (const bot of added) this.walkIn(bot.id, bot.seat);
    return result;
  }

  /** Reinicia a contagem de inatividade. */
  private touch(): void {
    this.idleTimer?.clear();
    this.idleTimer = this.clock.setTimeout(() => void this.disconnect(CLOSE_IDLE), this.idleSeconds * 1000);
  }

  static list(): RoomSummary[] {
    return [...MesaRoom.rooms].map((r) => r.summary()).sort((a, b) => Number(!!b.code) - Number(!!a.code) || b.players - a.players);
  }

  /** A sala na lista do lobby; a privada não revela código nem nomes. */
  summary(): RoomSummary {
    const players = this.table.humans();
    return {
      code: this.open ? this.roomId : null,
      seats: this.table.seatCount,
      players: players.length,
      bots: this.table.players.size - players.length,
      names: this.open ? players.map((p) => p.name) : [],
      playing: this.table.phase === PHASE_PLAYING,
      goal: this.table.rules.goal,
      flor: this.table.rules.flor,
    };
  }

  onJoin(client: Client, options: JoinOptions = {}): void {
    const name = parseName(options?.name) ?? placeholderName(this.joined);
    this.joined++;
    this.table.join(client.sessionId, name, parseCharacter(options?.character) ?? DEFAULT_CHARACTER);
    // Contra o computador: a primeira cadeira fica para o anfitrião escolher (ou trocar com o computador).
    if (this.vsComputer && this.table.humans().length === 1) this.addBots(client.sessionId, 0);
    processMetrics.players++;
    this.touch();
    this.sync();
    // Quem entra no meio da partida assiste: recebe o estado (sem cartas).
    if (this.match) client.send(MSG_HAND, this.handMessage(client.sessionId));
  }

  /** Queda sem despedida: a cadeira fica guardada pelo prazo de reconexão; o computador joga por ela se preciso. */
  onDrop(client: Client): void {
    this.table.setConnected(client.sessionId, false);
    this.sync();
    if (this.match) this.matchChanged();
    this.allowReconnection(client, this.reconnectSeconds);
  }

  onReconnect(client: Client): void {
    this.table.setConnected(client.sessionId, true);
    this.sync();
    // As cartas e o que pode fazer: podem ter mudado durante a queda (ou a aba recarregou).
    if (this.match) this.matchChanged();
    else client.send(MSG_HAND, this.handMessage(client.sessionId));
  }

  /** Saída definitiva: por vontade própria ou fim do prazo de reconexão. No meio da partida, o computador assume. */
  onLeave(client: Client): void {
    this.signalAt.delete(client.sessionId);
    this.observedSignals.forget(this.table.players.get(client.sessionId)?.seat ?? -1);
    this.table.leave(client.sessionId);
    processMetrics.players--;
    this.sync();
    if (this.match && this.table.phase === PHASE_PLAYING) this.matchChanged();
  }

  // ------------------------------------------------------------------ partida

  private startMatch(): void {
    this.lastHandSummary = null;
    this.signalAt.clear();
    this.observedSignals.clear();
    const r = this.table.rules;
    this.match = new SpanishMatch(gauderio({ goal: r.goal, flor: r.flor }), this.table.seatCount, randomInt(2 ** 31));
    this.match.startHand();
    this.matchChanged();
  }

  private stopMatch(): void {
    this.observedSignals.clear();
    this.match = null;
    this.clearDecision();
    this.state.game = '';
    for (const client of this.clients) client.send(MSG_HAND, this.handMessage(client.sessionId));
    this.sync();
  }

  private receiveAction(client: Client, raw: unknown): void {
    this.touch();
    const m = this.match;
    if (!m || this.table.phase !== PHASE_PLAYING) return void client.send(MSG_REFUSED, { text: NO_MATCH });
    const seat = this.table.players.get(client.sessionId)?.seat ?? -1;
    if (seat < 0) return void client.send(MSG_REFUSED, { text: NOT_SEATED });
    const action = parseAction(raw);
    const version = parseActionVersion(raw);
    if (!action || version === null) return;
    if (version !== m.version) return void client.send(MSG_REFUSED, { text: STALE_ACTION });
    const result = m.apply(seat, action);
    if (!result.ok) return void client.send(MSG_REFUSED, { text: ACTION_ERROR_TEXT[result.error] });
    this.matchChanged();
  }

  /** Gesto público e passageiro, sem mexer em versão, cartas ou relógio da decisão. */
  private receiveSignal(client: Client, raw: unknown): void {
    const request = parseSignalRequest(raw);
    if (!request) return;
    const m = this.match;
    const p = this.table.players.get(client.sessionId);
    const hand = m?.view().hand;
    if (!m || this.table.phase !== PHASE_PLAYING || this.table.seatCount !== 4 ||
        m.winner !== null || !hand || hand.ended || hand.number !== request.hand ||
        !p || p.seat < 0 || !p.connected || !p.settled || hand.folded[p.seat]) return;
    const now = Date.now();
    if (now - (this.signalAt.get(client.sessionId) ?? -Infinity) < SIGNAL_COOLDOWN_MS) return;
    this.signalAt.set(client.sessionId, now);
    this.observedSignals.observe(m.view(), p.seat, request.signal);
    this.touch();
    // A cadeira vem da sessão, nunca do payload. Todos podem observar, inclusive adversários.
    this.broadcast(MSG_TABLE_SIGNAL, { ...request, seat: p.seat, id: ++this.signalId });
  }

  /** Depois de toda mudança: agenda a próxima decisão (computador, relógio, pausa) e manda o estado. */
  private matchChanged(): void {
    if (this.match?.winner !== null && this.match) this.table.prepareRematch();
    this.scheduleDecision();
    this.syncGame();
    for (const client of this.clients) client.send(MSG_HAND, this.handMessage(client.sessionId));
  }

  private clearDecision(): void {
    this.decisionTimer?.clear();
    this.decisionTimer = null;
    this.deadline = 0;
    this.deadlineMs = 0;
  }

  private setDeadline(ms: number, at = Date.now() + ms): void {
    this.deadline = at;
    this.deadlineMs = ms;
  }

  /**
   * Quanto falta para a decisão desta versão vencer: na primeira vez, `ms` inteiros; reagendada na mesma
   * versão (queda ou volta de alguém), só o que restava do prazo já marcado.
   */
  private dueIn(m: SpanishMatch, kind: 'relogio' | 'pausa', ms: number): { delay: number; at: number } {
    const now = Date.now();
    const d = this.due;
    if (d && d.match === m && d.version === m.version && d.kind === kind) return { delay: Math.max(0, d.at - now), at: d.at };
    this.due = { match: m, version: m.version, kind, at: now + ms };
    return { delay: ms, at: now + ms };
  }

  private seatController(seat: number): { bot: boolean; connected: boolean } {
    const p = this.table.occupant(seat);
    return { bot: p?.bot ?? true, connected: p?.connected ?? false };
  }

  /**
   * Quem decide agora e quando o computador entra. Pessoas conectadas entre os que podem agir têm o tempo
   * de jogada; se ele acabar, o computador age (pela cadeira do computador na equipe, se houver). Sem
   * nenhuma pessoa conectada para decidir, o computador age depois do seu atraso (ou da tolerância, se
   * quem devia decidir só caiu).
   */
  private scheduleDecision(): void {
    this.clearDecision();
    const m = this.match;
    if (!m || m.winner !== null) return;
    const version = m.version;
    if (m.handOver) {
      // Conferência (Flor escondida): a pausa fica mais longa para dar tempo de olhar as cartas mostradas. O
      // computador contesta só se viu a Flor; quem deixa passar, deixa (o tempo não contesta por ninguém).
      const reviewers = m.actors();
      const botSeat = reviewers.find((s) => this.seatController(s).bot && botContests(m, s));
      if (botSeat !== undefined) {
        const [lo, hi] = this.botDelayMs;
        this.decisionTimer = this.clock.setTimeout(() => this.autoAct(botSeat, version), lo + Math.floor(this.botRandom() * (hi - lo + 1)));
        return;
      }
      const pause = reviewers.length > 0 ? this.reviewPauseMs : this.handPauseMs;
      const due = this.dueIn(m, 'pausa', pause);
      if (reviewers.length > 0) this.setDeadline(pause, due.at);
      this.decisionTimer = this.clock.setTimeout(() => {
        if (this.match !== m || m.version !== version) return;
        m.nextHand();
        this.matchChanged();
      }, due.delay);
      return;
    }
    const actors = m.actors();
    const people = actors.filter((s) => {
      const c = this.seatController(s);
      return !c.bot && c.connected;
    });
    const botSeat = actors.find((s) => this.seatController(s).bot);
    const actor = botSeat ?? actors[0]!;
    let delay: number;
    if (people.length > 0) {
      const turnMs = this.table.rules.turnSeconds * this.secondMs;
      const due = this.dueIn(m, 'relogio', turnMs);
      delay = due.delay;
      this.setDeadline(turnMs, due.at);
    } else if (botSeat !== undefined) {
      const [lo, hi] = this.botDelayMs;
      delay = lo + Math.floor(this.botRandom() * (hi - lo + 1));
    } else {
      delay = this.droppedGraceMs;
    }
    this.decisionTimer = this.clock.setTimeout(() => this.autoAct(actor, version), delay);
  }

  /** O computador joga por esta cadeira (computador, quem caiu ou quem deixou o tempo acabar). */
  private autoAct(seat: number, version: number): void {
    const m = this.match;
    if (!m || m.version !== version) return;
    let action: Action;
    try {
      action = botAction(m, seat, this.botRandom, this.observedSignals.forHand(m.view()), this.table.rules.botDifficulty);
    } catch {
      return;
    }
    if (m.apply(seat, action).ok) this.matchChanged();
  }

  private handMessage(id: string): HandMessage {
    const m = this.match;
    const seat = this.table.players.get(id)?.seat ?? -1;
    if (!m || seat < 0 || this.table.phase !== PHASE_PLAYING) return { cards: [], actions: [], playable: [], version: m?.version ?? 0 };
    const legal = m.legalActions(seat);
    return {
      cards: m.handOf(seat).map(cardId),
      actions: [...new Set(legal.map((a) => a.type))],
      playable: legal.filter((a) => a.type === 'jogar').map((a) => cardId(a.card!)),
      version: m.version,
    };
  }

  /** A visão pública da partida, mais o relógio de quem decide agora (tempo restante, não hora absoluta). */
  private syncGame(): void {
    const m = this.match;
    if (!m) {
      this.state.game = '';
      return;
    }
    const remainingMs = this.deadline ? Math.max(0, this.deadline - Date.now()) : null;
    const view = m.view();
    this.lastHandSummary = summarizeHand(view) ?? this.lastHandSummary;
    this.state.game = JSON.stringify({ ...view, lastHandSummary: this.lastHandSummary, timer: { seconds: this.deadlineMs / 1000 || this.table.rules.turnSeconds, remainingMs } });
    this.sync();
  }

  /** Copia a mesa para o estado sincronizado. */
  private sync(): void {
    const s = this.state;
    const table = this.table;
    s.phase = table.phase;
    s.hostId = table.hostId;
    s.goal = table.rules.goal;
    s.flor = table.rules.flor;
    s.turnSeconds = table.rules.turnSeconds;
    s.botDifficulty = table.rules.botDifficulty ?? 'equilibrado';
    s.scenery = table.scenery;
    for (const id of [...s.players.keys()]) if (!table.players.has(id)) s.players.delete(id);
    for (const p of table.players.values()) {
      let net = s.players.get(p.id);
      if (!net) {
        net = new PlayerSchema();
        s.players.set(p.id, net);
      }
      net.name = p.name;
      net.character = p.character;
      net.seat = p.seat;
      net.ready = p.ready;
      net.connected = p.connected;
      net.bot = p.bot;
      net.cards = this.match && p.seat >= 0 ? this.match.handOf(p.seat).length : 0;
    }
    for (let i = 0; i < table.seatCount; i++) {
      const seat = s.seats[i]!;
      seat.status = table.seatStatus(i);
      seat.playerId = table.occupant(i)?.id ?? '';
    }
  }
}
