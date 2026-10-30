import { createServer } from 'node:http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOMS_PER_ADDRESS, ROOM_NAME } from '@trukenza/shared';
import { MesaRoom } from './MesaRoom.ts';
import { AttemptLimiter, limitJoins, limitRooms, markPeerAddress } from './joinLimit.ts';
import { processMetrics, startMetricsLog } from './metrics.ts';
import { serveRoomList } from './roomList.ts';

// Variáveis de ambiente:
// - PORT: porta do servidor (padrão 2580; o Riscote usa a 2567 na mesma máquina).
// - TRUKENZA_IP_HEADER: cabeçalho com o IP do jogador garantido por um proxy confiável
//   (cf-connecting-ip atrás do túnel da Cloudflare). Sem proxy, vale o endereço do socket.
// - TRUKENZA_JOIN_LIMIT: tentativas de criar/entrar em sala por minuto por endereço (padrão 20; 0 desliga).
// - TRUKENZA_MAX_ROOMS: mesas abertas ao mesmo tempo (padrão 50; 0 desliga). Acima disso, criar
//   responde 503; entrar pelo código continua valendo. Cada endereço mantém no máximo
//   ROOMS_PER_ADDRESS mesas criadas por ele.
// - TRUKENZA_METRICS=1: uma linha JSON de métricas do processo por minuto.
// - TRUKENZA_HOST: interface de escuta (padrão: todas).
const port = Number(process.env.PORT ?? 2580);
const host = process.env.TRUKENZA_HOST || undefined;

const http = createServer();
markPeerAddress(http, process.env.TRUKENZA_IP_HEADER || undefined);
serveRoomList(http, () => MesaRoom.list());
const joinLimit = Number(process.env.TRUKENZA_JOIN_LIMIT ?? 20);
if (joinLimit > 0) limitJoins(new AttemptLimiter(joinLimit, 60_000));
const maxRooms = Number(process.env.TRUKENZA_MAX_ROOMS ?? 50);
if (maxRooms > 0) {
  limitRooms(maxRooms, () => processMetrics.rooms, ROOMS_PER_ADDRESS, (id) => [...MesaRoom.rooms].some((r) => r.roomId === id));
}
if (process.env.TRUKENZA_METRICS === '1') startMetricsLog();

const server = new Server({ transport: new WebSocketTransport({ server: http }), greet: false });
server.define(ROOM_NAME, MesaRoom);
await server.listen(port, host);
console.log(`Trukenza: servidor de mesas em ws://${host ?? 'localhost'}:${port}`);
