import { createServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import type { Room as ClientRoom } from '@colyseus/sdk';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { ACTION_ERROR_TEXT, parseCardId, type MatchView } from '@trukenza/game-engine';
import {
  MSG_ACTION,
  MSG_SCENERY,
  MSG_PHRASE,
  MSG_SIGNAL,
  MSG_TABLE_PHRASE,
  MSG_TABLE_SIGNAL,
  type TablePhrase,
  type TableSignal,
  MSG_ADD_BOTS,
  MSG_CHARACTER,
  MSG_END,
  MSG_HAND,
  MSG_READY,
  MSG_REFUSED,
  MSG_REMATCH,
  MSG_REMATCH_READY,
  MSG_REMOVE_BOT,
  MSG_RULES,
  MSG_SIT,
  MSG_STAND,
  MSG_START,
  PHASE_PLAYING,
  PHASE_WAITING,
  REFUSAL_TEXT,
  ROOM_LIST_PATH,
  ROOM_NAME,
  SEAT_AWAY,
  SEAT_FREE,
  SEAT_RESERVED,
  SEAT_TAKEN,
  describeJoinError,
  normalizeRoomCode,
  parseRoomList,
  saveSessionOnReconnect,
  type CreateRoomOptions,
  type HandMessage,
} from '@trukenza/shared';
import { MesaRoom } from '../src/MesaRoom.ts';
import { SignalMemory } from '../src/signalMemory.ts';
import { markPeerAddress } from '../src/joinLimit.ts';
import { serveRoomList } from '../src/roomList.ts';

/** Caminhada curta e prazo de reconexão de 1 s, para os testes não esperarem. */
class FastRoom extends MesaRoom {
  protected override readonly sitMs = 30;
  protected override readonly reconnectSeconds = 1;
}

let t: ColyseusTestServer;
let port = 0;

beforeAll(async () => {
  const http = createServer();
  markPeerAddress(http);
  serveRoomList(http, () => MesaRoom.list());
  const server = new Server({ transport: new WebSocketTransport({ server: http }), greet: false, gracefullyShutdown: false });
  server.define(ROOM_NAME, FastRoom);
  server.define(SPEED_ROOM, SpeedRoom);
  t = await boot(server);
  port = (http.address() as { port: number }).port;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await t.cleanup();
});
afterAll(async () => {
  await t.shutdown();
});

async function until(cond: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('tempo esgotado esperando a condição');
    await new Promise((r) => setTimeout(r, 2));
  }
}

async function newRoom(options: CreateRoomOptions = {}): Promise<MesaRoom> {
  return (await t.createRoom(ROOM_NAME, options)) as unknown as MesaRoom;
}

// O estado visto pelo cliente de teste não é tipado.
type TestClient = ClientRoom<any, any>;

/** Guarda tudo o que chega de um tipo de mensagem. */
function inbox<T>(c: TestClient, type: string): T[] {
  const got: T[] = [];
  c.onMessage(type, (m: T) => got.push(m));
  return got;
}

const seatOf = (room: MesaRoom, c: TestClient) => room.state.players.get(c.sessionId)?.seat;

/** Senta todos na ordem, espera chegarem e marca pronto. */
async function seatAll(room: MesaRoom, clients: TestClient[]): Promise<void> {
  clients.forEach((c, i) => c.send(MSG_SIT, { seat: i }));
  await until(() => clients.every((_, i) => room.state.seats[i]?.status === SEAT_TAKEN));
  for (const c of clients) c.send(MSG_READY, { ready: true });
  await until(() => clients.every((c) => room.state.players.get(c.sessionId)?.ready));
}

describe('salas', () => {
  it('sincroniza cenário na criação, na troca e na entrada tardia; bloqueia visitante e partida', async () => {
    const room = await newRoom({ seats: 2, scenery: 'praia' });
    const host = await t.connectTo(room);
    const guest = await t.connectTo(room);
    await until(() => guest.state?.scenery === 'praia');
    const refusals = inbox<{ text: string }>(guest, MSG_REFUSED);
    guest.send(MSG_SCENERY, { scenery: 'vegas' });
    await until(() => refusals.length === 1);
    expect(room.state.scenery).toBe('praia');
    host.send(MSG_SCENERY, { scenery: 'constructor' });
    host.send(MSG_SCENERY, { scenery: 'paris' });
    await until(() => host.state.scenery === 'paris' && guest.state.scenery === 'paris');
    await seatAll(room, [host, guest]);
    host.send(MSG_START);
    await until(() => room.state.phase === PHASE_PLAYING);
    const hostRefusals = inbox<{ text: string }>(host, MSG_REFUSED);
    host.send(MSG_SCENERY, { scenery: 'fuji' });
    await until(() => hostRefusals.length === 1);
    expect(room.state.scenery).toBe('paris');
    host.send(MSG_END);
    await until(() => room.state.phase === PHASE_WAITING);
    await guest.leave();
    const newcomer = await t.connectTo(room);
    await until(() => newcomer.state?.scenery === 'paris');
  });

  it('nasce com código legível, o número de cadeiras pedido e todas livres', async () => {
    const room = await newRoom({ seats: 4 });
    expect(normalizeRoomCode(room.roomId)).toBe(room.roomId);
    expect(room.state.seatCount).toBe(4);
    expect([...room.state.seats].map((s) => s.status)).toEqual([SEAT_FREE, SEAT_FREE, SEAT_FREE, SEAT_FREE]);
    expect((await newRoom({ seats: 3 as 2 })).state.seatCount).toBe(2);
  });

  it('nome e personagem da entrada valem; inválidos viram padrão', async () => {
    const room = await newRoom();
    const a = await t.connectTo(room, { name: '  Ana  ', character: 'baiaca' });
    const b = await t.connectTo(room, { name: '<script>', character: 'dragao' });
    await until(() => room.state.players.size === 2);
    expect(room.state.players.get(a.sessionId)).toMatchObject({ name: 'Ana', character: 'baiaca', seat: -1 });
    expect(room.state.players.get(b.sessionId)).toMatchObject({ name: 'Jogador 2', character: 'presuntinho' });
  });

  it('a mesa de 2 recusa o terceiro', async () => {
    const room = await newRoom({ seats: 2 });
    await t.connectTo(room);
    await t.connectTo(room);
    await expect(t.sdk.joinById(room.roomId)).rejects.toSatisfy((e) => describeJoinError(e).startsWith('Mesa cheia'));
  });

  it('novos personagens entram e trocam de aparência sentados sem perder cadeira nem pronto', async () => {
    const room = await newRoom({ seats: 2 });
    const luis = await t.connectTo(room, { name: 'Luis', character: 'luistesoura' });
    const gato = await t.connectTo(room, { name: 'Sardinha', character: 'sardinha' });
    await seatAll(room, [luis, gato]);
    expect(room.state.players.get(luis.sessionId)).toMatchObject({ character: 'luistesoura', seat: 0, ready: true });
    expect(room.state.players.get(gato.sessionId)).toMatchObject({ character: 'sardinha', seat: 1, ready: true });
    gato.send(MSG_CHARACTER, { character: 'gordodofusca' });
    await until(() => room.state.players.get(gato.sessionId)?.character === 'gordodofusca');
    expect(room.state.players.get(gato.sessionId)).toMatchObject({ character: 'gordodofusca', seat: 1, ready: true });
    gato.send(MSG_CHARACTER, { character: 'tiba' });
    await until(() => room.state.players.get(gato.sessionId)?.character === 'tiba');
    expect(room.state.players.get(gato.sessionId)).toMatchObject({ character: 'tiba', seat: 1, ready: true });
    gato.send(MSG_CHARACTER, { character: 'negon' });
    await until(() => room.state.players.get(gato.sessionId)?.character === 'negon');
    expect(room.state.players.get(gato.sessionId)).toMatchObject({ character: 'negon', seat: 1, ready: true });
    gato.send(MSG_CHARACTER, { character: 'sardinha' });
    await until(() => room.state.players.get(gato.sessionId)?.character === 'sardinha');
    luis.send(MSG_CHARACTER, { character: 'sardinha' });
    await until(() => room.state.players.get(luis.sessionId)?.character === 'sardinha');
    expect(room.state.players.get(luis.sessionId)).toMatchObject({ character: 'sardinha', seat: 0, ready: true });
    expect(room.state.players.get(gato.sessionId)).toMatchObject({ character: 'sardinha', seat: 1, ready: true });
  });

  it('sala privada (e contra o computador) só aceita quem tem o código; a pública segue no matchmaking', async () => {
    const hidden = await newRoom({ seats: 2 });
    const vsBots = await newRoom({ seats: 4, bots: true });
    await t.connectTo(hidden, { name: 'Ana' });
    await t.connectTo(vsBots, { name: 'Bia' });
    const privateIds = [hidden.roomId, vsBots.roomId];
    // Sem código: o matchmaking por nome não pode cair numa mesa privada.
    await expect(t.sdk.join(ROOM_NAME, { name: 'Intruso' })).rejects.toThrow();
    const created = await t.sdk.joinOrCreate(ROOM_NAME, { name: 'Intruso' });
    expect(privateIds).not.toContain(created.roomId);
    await created.leave();
    // Com o código (convite ou link), entra.
    const invited = await t.sdk.joinById(hidden.roomId, { name: 'Caio' });
    expect(invited.roomId).toBe(hidden.roomId);
    const invitedBots = await t.sdk.joinById(vsBots.roomId, { name: 'Duda' });
    expect(invitedBots.roomId).toBe(vsBots.roomId);
    // Controle: a pública continua achável pelo nome.
    const open = await newRoom({ open: true, seats: 2 });
    const found = await t.sdk.join(ROOM_NAME, { name: 'Eva' });
    expect(found.roomId).toBe(open.roomId);
  });

  it('a lista mostra código e nomes só da sala pública', async () => {
    const open = await newRoom({ open: true, seats: 4 });
    const hidden = await newRoom({ seats: 2 });
    await t.connectTo(open, { name: 'Ana' });
    await t.connectTo(hidden, { name: 'Bia' });
    const res = await fetch(`http://localhost:${port}${ROOM_LIST_PATH}`);
    const list = parseRoomList(await res.json());
    expect(list).toContainEqual({ code: open.roomId, seats: 4, players: 1, bots: 0, names: ['Ana'], playing: false, goal: 24, flor: true });
    expect(list).toContainEqual({ code: null, seats: 2, players: 1, bots: 0, names: [], playing: false, goal: 24, flor: true });
    expect(JSON.stringify(list)).not.toContain(hidden.roomId);
  });
});

describe('cadeiras', () => {
  it('reservada ao escolher, ocupada depois da caminhada, livre ao levantar', async () => {
    const room = await newRoom();
    const a = await t.connectTo(room);
    a.send(MSG_SIT, { seat: 1 });
    await until(() => room.state.seats[1]!.status === SEAT_RESERVED);
    expect(room.state.seats[1]!.playerId).toBe(a.sessionId);
    await until(() => room.state.seats[1]!.status === SEAT_TAKEN);
    a.send(MSG_STAND);
    await until(() => room.state.seats[1]!.status === SEAT_FREE);
    expect(seatOf(room, a)).toBe(-1);
  });

  it('pedidos simultâneos pela mesma cadeira: um senta, o outro é avisado', async () => {
    const room = await newRoom({ seats: 4 });
    const clients = [await t.connectTo(room), await t.connectTo(room), await t.connectTo(room), await t.connectTo(room)];
    const refusals = clients.map((c) => inbox<{ text: string }>(c, MSG_REFUSED));
    for (const c of clients) c.send(MSG_SIT, { seat: 2 });
    await until(() => refusals.flat().length === 3);
    const seated = clients.filter((c) => seatOf(room, c) === 2);
    expect(seated).toHaveLength(1);
    expect(room.state.seats[2]!.playerId).toBe(seated[0]!.sessionId);
    expect(refusals.flat().every((r) => r.text === REFUSAL_TEXT['cadeira-ocupada'])).toBe(true);
    expect(clients.filter((c) => seatOf(room, c) === -1)).toHaveLength(3);
  });

  it('mensagens fora do formato são ignoradas', async () => {
    const room = await newRoom();
    const a = await t.connectTo(room);
    const refusals = inbox(a, MSG_REFUSED);
    for (const bad of [{ seat: 9 }, { seat: '0' }, 'x', null]) a.send(MSG_SIT, bad);
    a.send(MSG_CHARACTER, { character: 'dragao' });
    a.send(MSG_READY, { ready: 1 });
    a.send(MSG_SIT, { seat: 2 });
    await until(() => refusals.length === 1);
    expect(refusals[0]).toEqual({ text: REFUSAL_TEXT['cadeira-invalida'] });
    expect(seatOf(room, a)).toBe(-1);
  });
});

describe('partida', () => {
  it('o anfitrião começa; cada um recebe só a própria mão e os outros veem só a quantidade', async () => {
    const room = await newRoom({ seats: 4 });
    const clients = [await t.connectTo(room), await t.connectTo(room), await t.connectTo(room), await t.connectTo(room)];
    const hands = clients.map((c) => inbox<HandMessage>(c, MSG_HAND));
    await seatAll(room, clients);

    const refusals = inbox<{ text: string }>(clients[1]!, MSG_REFUSED);
    clients[1]!.send(MSG_START);
    await until(() => refusals.length === 1);
    expect(refusals[0]!.text).toBe(REFUSAL_TEXT['so-anfitriao']);

    clients[0]!.send(MSG_START);
    await until(() => hands.every((h) => h.length === 1));
    expect(room.state.phase).toBe(PHASE_PLAYING);
    const dealt = hands.map((h) => h[0]!.cards);
    for (const cards of dealt) {
      expect(cards).toHaveLength(3);
      for (const id of cards) expect(parseCardId(id)).not.toBeNull();
    }
    expect(new Set(dealt.flat()).size).toBe(12);
    // O estado sincronizado não carrega carta nenhuma, só a contagem.
    expect([...room.state.players.values()].every((p) => p.cards === 3)).toBe(true);
    expect(JSON.stringify(room.state.toJSON())).not.toMatch(/espadas|bastos|ouros|copas/);

    clients[0]!.send(MSG_END);
    await until(() => room.state.phase === PHASE_WAITING);
    await until(() => hands.every((h) => h.at(-1)!.cards.length === 0));
  });

  it('quem cai fica com a cadeira guardada e recebe a mão de volta ao reconectar', async () => {
    const room = await newRoom({ seats: 2 });
    const a = await t.connectTo(room);
    const b = await t.connectTo(room);
    const handB = inbox<HandMessage>(b, MSG_HAND);
    await seatAll(room, [a, b]);
    a.send(MSG_START);
    await until(() => handB.length === 1);

    const id = b.sessionId;
    const token = b.reconnectionToken;
    b.reconnection.enabled = false;
    await b.leave(false);
    await until(() => room.state.seats[1]!.status === SEAT_AWAY);
    expect(room.state.phase).toBe(PHASE_PLAYING);

    const back = await t.sdk.reconnect(token);
    const again = inbox<HandMessage>(back, MSG_HAND);
    expect(back.sessionId).toBe(id);
    await until(() => room.state.seats[1]!.status === SEAT_TAKEN && again.length === 1);
    expect(again[0]!.cards).toEqual(handB[0]!.cards);
  });

  it('a sessão guardada acompanha o token novo da reconexão automática e retoma a cadeira depois', async () => {
    const room = await newRoom({ seats: 2 });
    await t.connectTo(room);
    const b = await t.connectTo(room);
    const id = b.sessionId;
    // O SDK só reconecta sozinho salas com 5 s de vida; o teste não espera isso.
    b.reconnection.minUptime = 0;
    const saved = [b.reconnectionToken];
    saveSessionOnReconnect(b, () => true, (r) => saved.push(r.reconnectionToken));
    const replaced: string[] = [];
    saveSessionOnReconnect(b, () => false, (r) => replaced.push(r.reconnectionToken));

    // A rede cai sem despedida: o SDK reconecta sozinho e recebe outro token.
    const drops: number[] = [];
    b.onDrop((code: number) => drops.push(code));
    const server = room.clients.find((c) => c.sessionId === id) as unknown as { ref: { terminate(): void } };
    server.ref.terminate();
    await until(() => saved.length === 2, 4000);
    expect(drops).toHaveLength(1);
    expect(saved[1]).toBe(b.reconnectionToken);
    expect(saved[1]).not.toBe(saved[0]);
    expect(replaced).toEqual([]);

    // Recarregar a aba: a conexão cai e a página volta só com o token guardado.
    b.reconnection.enabled = false;
    await b.leave(false);
    await until(() => room.state.players.get(id)?.connected === false);
    await expect(t.sdk.reconnect(saved[0]!)).rejects.toThrow();
    const back = await t.sdk.reconnect(saved.at(-1)!);
    expect(back.sessionId).toBe(id);
  });

  it('sem reconexão no prazo, o computador assume a cadeira e a partida segue; o anfitrião passa adiante', async () => {
    const room = await newRoom({ seats: 2 });
    const a = await t.connectTo(room);
    const b = await t.connectTo(room);
    const handB = inbox<HandMessage>(b, MSG_HAND);
    await seatAll(room, [a, b]);
    a.send(MSG_START);
    await until(() => handB.length === 1);

    a.reconnection.enabled = false;
    await a.leave(false);
    await until(() => room.state.players.get(room.state.seats[0]!.playerId)?.bot === true, 3000);
    expect(room.state.phase).toBe(PHASE_PLAYING);
    expect(room.state.seats[0]!.status).toBe(SEAT_TAKEN);
    expect(room.state.hostId).toBe(b.sessionId);
    expect(handB.at(-1)!.cards).toHaveLength(3);
  });
});

/** Relógio e computador acelerados: partidas inteiras em poucos segundos. */
class SpeedRoom extends MesaRoom {
  protected override readonly sitMs = 10;
  protected override readonly botDelayMs = [5, 15] as const;
  protected override readonly handPauseMs = 20;
  protected override readonly reviewPauseMs = 20;
  protected override readonly droppedGraceMs = 50;
  protected override readonly secondMs = 4;
}
const SPEED_ROOM = 'mesa-rapida';

const gameOf = (room: MesaRoom): MatchView & { timer: { seconds: number; remainingMs: number | null } } => JSON.parse(room.state.game);

describe('sinais de dupla', () => {
  it('todos veem o gesto, a sessão define o autor, e não muda cartas, versão nem relógio', async () => {
    const observe = vi.spyOn(SignalMemory.prototype, 'observe');
    const room = await newRoom({ seats: 4, rules: { turnSeconds: 60 } });
    const clients: TestClient[] = [];
    for (let i = 0; i < 4; i++) clients.push(await t.connectTo(room));
    const received = clients.map(c => inbox<TableSignal>(c, MSG_TABLE_SIGNAL));
    await seatAll(room, clients);
    clients[0]!.send(MSG_START);
    await until(() => !!room.state.game);
    const before = room.state.game;
    const hand = gameOf(room).hand!.number;
    clients[0]!.send(MSG_SIGNAL, { signal: 'piscada', hand, seat: 3, card: '1-espadas' });
    await until(() => received.every(messages => messages.length === 1));
    expect(received.map(messages => messages[0])).toEqual(Array(4).fill({ signal: 'piscada', hand, seat: 0, id: 1 }));
    expect(room.state.game).toBe(before);
    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe.mock.calls[0]!.slice(1)).toEqual([0, 'piscada']);
    const memory = observe.mock.instances[0] as SignalMemory;
    expect(memory.forHand(gameOf(room))).toEqual([{ seat: 0, hand, played: 0, power: 13 }]);
    clients[0]!.send(MSG_SIGNAL, { signal: 'olhos', hand });
    // Outro participante pode sinalizar fora da própria vez; serve também como barreira de mensagens.
    clients[1]!.send(MSG_SIGNAL, { signal: 'sobrancelhas', hand });
    await until(() => received.every(messages => messages.length === 2));
    expect(received[0]!.map(x => x.seat)).toEqual([0, 1]);
    clients[2]!.send(MSG_SIGNAL, { signal: 'bico', hand: hand + 1 });
    clients[3]!.send(MSG_SIGNAL, { signal: 'desconhecido', hand });
    await new Promise(r => setTimeout(r, 60));
    expect(received.every(messages => messages.length === 2)).toBe(true);
    expect(observe).toHaveBeenCalledTimes(2);
    clients[0]!.send(MSG_END);
    await until(() => room.state.game === '');
    expect(memory.forHand(JSON.parse(before))).toEqual([]);
    clients[2]!.send(MSG_SIGNAL, { signal: 'bico', hand });
    await new Promise(r => setTimeout(r, 60));
    expect(received.every(messages => messages.length === 2)).toBe(true);
  });

  it('não transmite na espera nem no mano a mano', async () => {
    const room = await newRoom({ seats: 2 });
    const a = await t.connectTo(room);
    const b = await t.connectTo(room);
    const received = inbox<TableSignal>(b, MSG_TABLE_SIGNAL);
    a.send(MSG_SIGNAL, { signal: 'olhos', hand: 1 });
    await seatAll(room, [a, b]);
    a.send(MSG_START);
    await until(() => !!room.state.game);
    a.send(MSG_SIGNAL, { signal: 'olhos', hand: gameOf(room).hand!.number });
    await new Promise(r => setTimeout(r, 60));
    expect(received).toEqual([]);
  });

  it('espectador não sinaliza nem assume a cadeira informada no payload', async () => {
    const room = await newRoom({ seats: 4, bots: true, rules: { turnSeconds: 60 } });
    const a = await t.connectTo(room);
    a.send(MSG_SIT, { seat: 0 });
    await until(() => room.state.seats.every(s => s.status === SEAT_TAKEN));
    a.send(MSG_READY, { ready: true });
    await until(() => !!room.state.players.get(a.sessionId)?.ready);
    a.send(MSG_START);
    await until(() => !!room.state.game);
    const spectator = await t.connectTo(room);
    const received = inbox<TableSignal>(a, MSG_TABLE_SIGNAL);
    spectator.send(MSG_SIGNAL, { signal: 'olhos', hand: gameOf(room).hand!.number, seat: 0 });
    await new Promise(r => setTimeout(r, 60));
    expect(received).toEqual([]);
  });
});

describe('frases rápidas', () => {
  it('na espera e na partida: todos ouvem, a sessão define a cadeira e o intervalo segura a enxurrada', async () => {
    const room = await newRoom({ seats: 4, rules: { turnSeconds: 60 } });
    const a = await t.connectTo(room);
    const b = await t.connectTo(room);
    const spectator = await t.connectTo(room);
    const heard = [a, b, spectator].map(c => inbox<TablePhrase>(c, MSG_TABLE_PHRASE));
    // Em pé ninguém fala pela mesa.
    a.send(MSG_PHRASE, { phrase: 'medo' });
    await seatAll(room, [a, b]);
    const before = room.state.game;
    a.send(MSG_PHRASE, { phrase: 'saude', seat: 1, text: 'qualquer coisa' });
    await until(() => heard.every(m => m.length === 1));
    expect(heard.map(m => m[0])).toEqual(Array(3).fill({ phrase: 'saude', seat: 0, id: 1 }));
    expect(room.state.game).toBe(before);
    // Dentro do intervalo, desconhecida ou de quem não senta: descartadas em silêncio.
    a.send(MSG_PHRASE, { phrase: 'blefe' });
    b.send(MSG_PHRASE, { phrase: 'Bora mais uma?' });
    spectator.send(MSG_PHRASE, { phrase: 'boa', seat: 0 });
    await new Promise(r => setTimeout(r, 60));
    expect(heard.every(m => m.length === 1)).toBe(true);
    a.send(MSG_ADD_BOTS);
    await until(() => room.state.seats.every(s => s.status === SEAT_TAKEN));
    a.send(MSG_START);
    await until(() => !!room.state.game);
    // Na partida também: a frase não mexe no estado nem na vez.
    const game = room.state.game;
    b.send(MSG_PHRASE, { phrase: 'boa' });
    await until(() => heard.every(m => m.length === 2));
    expect(heard[0]!.map(m => [m.seat, m.phrase])).toEqual([[0, 'saude'], [1, 'boa']]);
    expect(room.state.game).toBe(game);
    b.send(MSG_PHRASE, { phrase: 'medo' });
    await new Promise(r => setTimeout(r, 60));
    expect(heard[0]!.length).toBe(2);
  });
});

/** Entra 2 pessoas, senta, prontos e começa; devolve os clientes na ordem das cadeiras. */
async function startTwo(room: MesaRoom): Promise<[TestClient, TestClient]> {
  const a = await t.connectTo(room, { name: 'Ana' });
  const b = await t.connectTo(room, { name: 'Bia' });
  await seatAll(room, [a, b]);
  a.send(MSG_START);
  await until(() => room.state.game !== '');
  return [a, b];
}

describe('regras do truco na sala', () => {
  it('cartas privadas: cada um vê as suas e as ações dele; o estado público não tem carta de ninguém', async () => {
    const room = await newRoom({ seats: 2 });
    const a = await t.connectTo(room);
    const b = await t.connectTo(room);
    const hands = [inbox<HandMessage>(a, MSG_HAND), inbox<HandMessage>(b, MSG_HAND)];
    await seatAll(room, [a, b]);
    a.send(MSG_START);
    await until(() => hands.every((h) => h.length > 0));
    const game = gameOf(room);
    const turn = game.hand!.turn;
    expect(hands[turn]!.at(-1)!.actions).toContain('jogar');
    expect(hands[turn]!.at(-1)!.playable.length).toBeGreaterThan(0);
    expect(hands[1 - turn]!.at(-1)!.actions).toEqual([]);
    for (const h of hands) for (const id of h.at(-1)!.cards) expect(room.state.game).not.toContain(id);
  });

  it('jogada fora da vez, ação ilegal e versão velha são recusadas; comando repetido não vale duas vezes', async () => {
    const room = await newRoom({ seats: 2, rules: { flor: false } });
    const [a, b] = await startTwo(room);
    const clients = [a, b];
    const turn = gameOf(room).hand!.turn;
    const me = clients[turn]!;
    const other = clients[1 - turn]!;
    const version = gameOf(room).version;
    const refusals = inbox<{ text: string }>(other, MSG_REFUSED);
    const myRefusals = inbox<{ text: string }>(me, MSG_REFUSED);

    other.send(MSG_ACTION, { type: 'truco', version });
    await until(() => refusals.length === 1);
    expect(refusals[0]!.text).toBe(ACTION_ERROR_TEXT['acao-invalida']);

    // O mesmo pedido duas vezes com a mesma versão: o segundo chega com a versão já velha.
    me.send(MSG_ACTION, { type: 'truco', version });
    me.send(MSG_ACTION, { type: 'truco', version });
    await until(() => myRefusals.length === 1);
    expect(myRefusals[0]!.text).toMatch(/mesa mudou/);
    expect(gameOf(room).hand!.truco.pending).toMatchObject({ seat: turn, level: 2 });
    expect(gameOf(room).version).toBe(version + 1);
  });

  it('reconexão no meio de um Truco pendente mantém a aposta, as cartas e as respostas', async () => {
    const room = await newRoom({ seats: 2, rules: { flor: false } });
    const [a, b] = await startTwo(room);
    const clients = [a, b];
    const turn = gameOf(room).hand!.turn;
    const caller = clients[turn]!;
    const responder = clients[1 - turn]!;
    const before = inbox<HandMessage>(responder, MSG_HAND);
    caller.send(MSG_ACTION, { type: 'truco', version: gameOf(room).version });
    await until(() => gameOf(room).hand!.truco.pending !== null && before.length > 0);
    const cards = before.at(-1)!.cards;

    const token = responder.reconnectionToken;
    responder.reconnection.enabled = false;
    await responder.leave(false);
    await until(() => room.state.seats[1 - turn]!.status === SEAT_AWAY);
    const back = await t.sdk.reconnect(token);
    const again = inbox<HandMessage>(back, MSG_HAND);
    await until(() => again.length > 0);
    expect(again.at(-1)!.cards).toEqual(cards);
    expect(again.at(-1)!.actions).toEqual(expect.arrayContaining(['quero', 'nao-quero']));
    expect(gameOf(room).hand!.truco.pending).toMatchObject({ seat: turn, level: 2 });
    back.send(MSG_ACTION, { type: 'quero', version: again.at(-1)!.version });
    await until(() => gameOf(room).hand!.truco.level === 2);
  });

  it('as regras escolhidas valem na partida e ficam travadas depois do começo', async () => {
    const room = await newRoom({ seats: 2, rules: { goal: 12, flor: false } });
    const a = await t.connectTo(room);
    const b = await t.connectTo(room);
    a.send(MSG_RULES, { goal: 12, flor: false, turnSeconds: 60 });
    await until(() => room.state.turnSeconds === 60);
    expect(room.summary()).toMatchObject({ goal: 12, flor: false });
    await seatAll(room, [a, b]);
    a.send(MSG_START);
    await until(() => room.state.game !== '');
    expect(gameOf(room)).toMatchObject({ goal: 12, flor: false, profile: 'GAUDERIO_24' });
    const refusals = inbox<{ text: string }>(a, MSG_REFUSED);
    a.send(MSG_RULES, { goal: 24 });
    await until(() => refusals.length === 1);
    expect(refusals[0]!.text).toBe(REFUSAL_TEXT['partida-em-andamento']);
    expect(room.state.goal).toBe(12);
  });

  /** Ninguém mexe: o relógio vence e o computador joga por todos até alguém ganhar. */
  async function playToEnd(seats: 2 | 4): Promise<MatchView> {
    const room = (await t.createRoom(SPEED_ROOM, { seats, bots: true, rules: { goal: 12, turnSeconds: 15 } })) as unknown as MesaRoom;
    const a = await t.connectTo(room, { name: 'Ana' });
    await until(() => room.state.seats.filter((s) => s.status === SEAT_TAKEN).length === seats - 1);
    a.send(MSG_SIT, { seat: 0 });
    await until(() => room.state.seats[0]!.status === SEAT_TAKEN);
    a.send(MSG_READY, { ready: true });
    await until(() => room.state.players.get(a.sessionId)!.ready);
    a.send(MSG_START);
    await until(() => room.state.game !== '' && gameOf(room).winner !== null, 45_000);
    return gameOf(room);
  }

  it('partida completa de dois, até o fim, sem travar (computador e relógio)', async () => {
    const v = await playToEnd(2);
    expect(Math.max(...v.score)).toBeGreaterThanOrEqual(12);
    for (const team of [0, 1] as const) expect(v.history.filter((h) => h.team === team).reduce((n, h) => n + h.value, 0)).toBe(v.score[team]);
  }, 60_000);

  it('partida completa de quatro, até o fim, sem travar', async () => {
    const v = await playToEnd(4);
    expect(Math.max(...v.score)).toBeGreaterThanOrEqual(12);
  }, 60_000);

  it('o anfitrião pede revanche no fim; antes do fim, não', async () => {
    const room = (await t.createRoom(SPEED_ROOM, { seats: 2, bots: true, scenery: 'praia', rules: { goal: 12, turnSeconds: 15, botDifficulty: 'competitivo' } })) as unknown as MesaRoom;
    const a = await t.connectTo(room);
    const refusals = inbox<{ text: string }>(a, MSG_REFUSED);
    await until(() => room.state.seats[1]!.status === SEAT_TAKEN);
    a.send(MSG_SIT, { seat: 0 });
    await until(() => room.state.seats[0]!.status === SEAT_TAKEN);
    a.send(MSG_READY, { ready: true });
    await until(() => room.state.players.get(a.sessionId)!.ready);
    a.send(MSG_START);
    await until(() => room.state.game !== '');
    a.send(MSG_REMATCH);
    await until(() => refusals.length === 1);
    expect(refusals[0]!.text).toBe(REFUSAL_TEXT['partida-em-andamento']);
    await until(() => gameOf(room).winner !== null, 45_000);
    expect(room.state.players.get(a.sessionId)!.ready).toBe(false);
    expect([...room.state.players.values()].filter(p => p.bot).every(p => p.ready)).toBe(true);
    const summary = JSON.parse(room.state.game).lastHandSummary;
    expect(summary.number).toBe(gameOf(room).hand!.number);
    expect(summary.entries.length).toBeGreaterThan(0);
    a.send(MSG_REMATCH);
    await until(() => refusals.length === 2);
    expect(refusals[1]!.text).toBe(REFUSAL_TEXT['faltam-prontos']);
    a.send(MSG_REMATCH_READY, { ready: true });
    await until(() => room.state.players.get(a.sessionId)!.ready);
    a.send(MSG_REMATCH);
    await until(() => gameOf(room).winner === null && gameOf(room).score.every((s) => s === 0));
    expect(room.state.scenery).toBe('praia');
    expect(room.state.botDifficulty).toBe('competitivo');
    expect(JSON.parse(room.state.game).lastHandSummary).toBeNull();
  }, 60_000);
});

describe('relógio da decisão', () => {
  /** Queda sem despedida e volta pelo token, dentro do prazo de reconexão. */
  async function dropAndReturn(room: MesaRoom, c: TestClient, seat: number): Promise<TestClient> {
    const token = c.reconnectionToken;
    c.reconnection.enabled = false;
    await c.leave(false);
    await until(() => room.state.seats[seat]!.status === SEAT_AWAY);
    const back = await t.sdk.reconnect(token);
    await until(() => room.state.seats[seat]!.status === SEAT_TAKEN);
    return back;
  }

  it('queda e volta (de quem não decide e de quem decide) mantêm o prazo; decisão nova renova', async () => {
    const room = await newRoom({ seats: 2, rules: { flor: false, turnSeconds: 60 } });
    const clients = await startTwo(room);
    const start = gameOf(room);
    const turn = start.hand!.turn;
    const first = start.timer.remainingMs!;
    expect(first).toBeGreaterThan(55_000);
    await new Promise((r) => setTimeout(r, 400));

    await dropAndReturn(room, clients[1 - turn]!, 1 - turn);
    const afterOther = gameOf(room);
    expect(afterOther.version).toBe(start.version);
    expect(afterOther.timer.remainingMs!).toBeLessThanOrEqual(first - 400);

    const actor = await dropAndReturn(room, clients[turn]!, turn);
    const afterActor = gameOf(room);
    expect(afterActor.version).toBe(start.version);
    expect(afterActor.timer.remainingMs!).toBeLessThanOrEqual(afterOther.timer.remainingMs!);

    // Controle: uma decisão nova (Truco pedido) ganha o prazo inteiro.
    actor.send(MSG_ACTION, { type: 'truco', version: start.version });
    await until(() => gameOf(room).version === start.version + 1);
    expect(gameOf(room).timer.remainingMs!).toBeGreaterThan(afterActor.timer.remainingMs! + 300);
  });
});

describe('computador', () => {
  it('o anfitrião completa a mesa; o computador entra na lista sem lotar a sala', async () => {
    const room = await newRoom({ seats: 4, open: true });
    const a = await t.connectTo(room, { name: 'Ana' });
    const b = await t.connectTo(room, { name: 'Bia' });
    const refusals = inbox<{ text: string }>(b, MSG_REFUSED);
    b.send(MSG_ADD_BOTS);
    await until(() => refusals.length === 1);
    expect(refusals[0]!.text).toBe(REFUSAL_TEXT['so-anfitriao']);

    a.send(MSG_SIT, { seat: 0 });
    await until(() => seatOf(room, a) === 0);
    a.send(MSG_ADD_BOTS);
    await until(() => [1, 2, 3].every((i) => room.state.seats[i]!.status === SEAT_TAKEN));
    const bots = [...room.state.players.values()].filter((p) => p.bot);
    expect(bots).toHaveLength(3);
    expect(bots.every((p) => p.ready)).toBe(true);
    expect(room.summary()).toMatchObject({ players: 2, bots: 3, names: ['Ana', 'Bia'] });
    // A sala aceita mais gente: o computador não ocupa vaga de pessoa.
    await t.connectTo(room, { name: 'Caio' });
    await until(() => room.state.players.size === 6);
  });

  it('quem chega senta no lugar do computador; a partida começa e o computador recebe cartas', async () => {
    const room = await newRoom({ seats: 2 });
    const a = await t.connectTo(room, { name: 'Ana' });
    const hand = inbox<HandMessage>(a, MSG_HAND);
    a.send(MSG_SIT, { seat: 0 });
    a.send(MSG_ADD_BOTS);
    await until(() => room.state.seats[1]!.status === SEAT_TAKEN && room.state.seats[0]!.status === SEAT_TAKEN);
    const botId = room.state.seats[1]!.playerId;

    const b = await t.connectTo(room, { name: 'Bia' });
    b.send(MSG_SIT, { seat: 1 });
    await until(() => room.state.seats[1]!.playerId === b.sessionId);
    expect(room.state.players.has(botId)).toBe(false);

    a.send(MSG_REMOVE_BOT, { seat: 1 });
    b.send(MSG_STAND);
    await until(() => room.state.seats[1]!.status === SEAT_FREE);
    a.send(MSG_ADD_BOTS);
    await until(() => room.state.seats[1]!.status === SEAT_TAKEN);
    a.send(MSG_READY, { ready: true });
    await until(() => room.state.players.get(a.sessionId)!.ready);
    a.send(MSG_START);
    await until(() => hand.length === 1);
    expect(room.state.phase).toBe(PHASE_PLAYING);
    const bot = room.state.players.get(room.state.seats[1]!.playerId)!;
    expect(bot.bot).toBe(true);
    expect(bot.cards).toBeGreaterThanOrEqual(2);
  });

  it('mesa contra o computador: ele ocupa as outras cadeiras e deixa a primeira para o anfitrião', async () => {
    const room = await newRoom({ seats: 4, bots: true });
    const a = await t.connectTo(room, { name: 'Ana' });
    await until(() => [1, 2, 3].every((i) => room.state.seats[i]!.status === SEAT_TAKEN));
    expect(room.state.seats[0]!.status).toBe(SEAT_FREE);
    expect(seatOf(room, a)).toBe(-1);
    expect(room.state.hostId).toBe(a.sessionId);
  });
});
