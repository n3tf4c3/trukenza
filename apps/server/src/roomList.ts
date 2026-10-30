import type { Server as HttpServer, ServerResponse } from 'node:http';
import { ROOM_LIST_PATH, type RoomSummary } from '@trukenza/shared';

/** O lobby consulta a cada poucos segundos: a mesma resposta serve a todos por este tempo. */
const CACHE_MS = 1000;

/**
 * Responde `GET /salas` com a lista das salas (só leitura, sem dados além do resumo público).
 * Como `markPeerAddress`, intercepta o `emit('request')`: o roteador do Colyseus é registrado
 * antes de qualquer listener nosso. Outras rotas seguem para o Colyseus.
 */
export function serveRoomList(server: HttpServer, list: () => RoomSummary[], now: () => number = Date.now): void {
  let cached = '';
  let cachedAt = -Infinity;
  const emit = server.emit as (this: HttpServer, event: string | symbol, ...args: unknown[]) => boolean;
  server.emit = function (this: HttpServer, event: string | symbol, ...args: unknown[]): boolean {
    if (event === 'request') {
      const req = args[0] as { method?: string; url?: string };
      const res = args[1] as ServerResponse;
      const path = (req.url ?? '').split('?')[0];
      if (path === ROOM_LIST_PATH && (req.method === 'GET' || req.method === 'OPTIONS')) {
        if (now() - cachedAt >= CACHE_MS) {
          cached = JSON.stringify(list());
          cachedAt = now();
        }
        res.writeHead(req.method === 'OPTIONS' ? 204 : 200, {
          'content-type': 'application/json; charset=utf-8',
          // A página fica em outro endereço (trukenza.win → play.trukenza.win); a lista é pública.
          'access-control-allow-origin': '*',
          'cache-control': 'no-store',
        });
        res.end(req.method === 'OPTIONS' ? undefined : cached);
        return true;
      }
    }
    return emit.call(this, event, ...args);
  } as typeof server.emit;
}
