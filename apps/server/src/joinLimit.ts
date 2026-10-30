import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { matchMaker, ServerError } from '@colyseus/core';
import { SERVER_FULL, TOO_MANY_JOINS, TOO_MANY_ROOMS } from '@trukenza/shared';

/**
 * Cabeçalho interno com o endereço de quem fez a requisição. É sempre sobrescrito pelo
 * servidor: o Colyseus confia em X-Forwarded-For/X-Real-IP vindos do cliente, que são forjáveis.
 */
export const PEER_HEADER = 'x-trukenza-peer';

/** Janela fixa por chave. Chaves vencidas são descartadas para o mapa não crescer sem limite. */
export class AttemptLimiter {
  private hits = new Map<string, { start: number; count: number }>();
  readonly max: number;
  readonly windowMs: number;
  private readonly now: () => number;

  constructor(max: number, windowMs: number, now: () => number = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  allow(key: string): boolean {
    const t = this.now();
    let hit = this.hits.get(key);
    if (!hit || t - hit.start >= this.windowMs) {
      hit = { start: t, count: 0 };
      this.hits.set(key, hit);
    }
    hit.count++;
    if (this.hits.size > 10_000) {
      for (const [k, h] of this.hits) if (t - h.start >= this.windowMs) this.hits.delete(k);
    }
    return hit.count <= this.max;
  }
}

/**
 * Marca cada requisição HTTP com o endereço real do socket ou, atrás de um proxy confiável
 * (ex.: `cf-connecting-ip` na Cloudflare), com o cabeçalho que esse proxy garante.
 * Intercepta o próprio `emit('request')`: o Colyseus registra o roteador com
 * `prependListener` no `listen()`, então um listener nosso rodaria tarde demais.
 */
export function markPeerAddress(server: HttpServer, trustedHeader?: string): void {
  const emit = server.emit as (this: HttpServer, event: string | symbol, ...args: unknown[]) => boolean;
  server.emit = function (this: HttpServer, event: string | symbol, ...args: unknown[]): boolean {
    if (event === 'request') {
      const req = args[0] as IncomingMessage;
      const raw = trustedHeader ? req.headers[trustedHeader.toLowerCase()] : undefined;
      const fromProxy = (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]?.trim();
      req.headers[PEER_HEADER] = fromProxy || req.socket.remoteAddress || 'desconhecido';
    }
    return emit.call(this, event, ...args);
  } as typeof server.emit;
}

const LIMITED_METHODS = new Set(['create', 'join', 'joinById', 'joinOrCreate']);

/**
 * Limita as tentativas de criar ou entrar em sala por endereço (contra força bruta de código
 * e abuso de criação de salas). Acima do limite, responde HTTP 429 antes de procurar a sala.
 * Devolve a função que desfaz a instalação.
 */
export function limitJoins(limiter: AttemptLimiter): () => void {
  const controller = matchMaker.controller;
  const original = controller.invokeMethod;
  controller.invokeMethod = async function (method, roomName, clientOptions, auth) {
    if (LIMITED_METHODS.has(method)) {
      const key = auth?.headers.get(PEER_HEADER) ?? 'desconhecido';
      if (!limiter.allow(key)) throw new ServerError(429, TOO_MANY_JOINS);
    }
    return original.call(this, method, roomName, clientOptions, auth);
  };
  return () => {
    controller.invokeMethod = original;
  };
}

const CREATING_METHODS = new Set(['create', 'joinOrCreate']);

/**
 * Limita as salas abertas ao mesmo tempo no processo.
 * Com `max` salas (contando as que estão sendo criadas), criar responde HTTP 503 antes de a sala
 * existir; entrar numa sala que já existe continua valendo.
 *
 * Com `perAddress`, cada endereço só mantém esse número de salas abertas criadas por ele (HTTP 429):
 * sem isso, um só endereço ocupava todas as salas. `alive` diz se uma sala criada ainda existe.
 * Devolve a função que desfaz a instalação.
 */
export function limitRooms(
  max: number,
  openRooms: () => number,
  perAddress = 0,
  alive: (roomId: string) => boolean = () => true,
): () => void {
  const controller = matchMaker.controller;
  const original = controller.invokeMethod;
  let creating = 0;
  /** Salas criadas por endereço, mais as que ainda estão sendo criadas (`pending`). */
  const byAddress = new Map<string, { rooms: Set<string>; pending: number }>();
  controller.invokeMethod = async function (method, roomName, clientOptions, auth) {
    if (!CREATING_METHODS.has(method)) return original.call(this, method, roomName, clientOptions, auth);
    if (openRooms() + creating >= max) throw new ServerError(503, SERVER_FULL);
    const key = auth?.headers.get(PEER_HEADER) ?? 'desconhecido';
    // Salas fechadas saem da conta; o mapa fica só com endereços que têm sala aberta.
    for (const [k, mine] of byAddress) {
      for (const id of mine.rooms) if (!alive(id)) mine.rooms.delete(id);
      if (mine.rooms.size === 0 && mine.pending === 0) byAddress.delete(k);
    }
    let mine = byAddress.get(key);
    if (perAddress > 0 && mine && mine.rooms.size + mine.pending >= perAddress) throw new ServerError(429, TOO_MANY_ROOMS);
    if (!mine) byAddress.set(key, (mine = { rooms: new Set(), pending: 0 }));
    creating++;
    mine.pending++;
    try {
      const seat = await original.call(this, method, roomName, clientOptions, auth);
      const roomId = (seat as { roomId?: unknown } | undefined)?.roomId;
      if (typeof roomId === 'string') mine.rooms.add(roomId);
      return seat;
    } finally {
      creating--;
      mine.pending--;
    }
  };
  return () => {
    controller.invokeMethod = original;
  };
}
