import { monitorEventLoopDelay } from 'node:perf_hooks';

/** Contagem do processo inteiro; não pertence a nenhuma sala e não influencia a partida. */
export const processMetrics = {
  rooms: 0,
  players: 0,
};

/** Uma linha JSON a cada `intervalMs` no log do servidor. */
export function startMetricsLog(intervalMs = 60_000): void {
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  let cpu = process.cpuUsage();
  let wall = performance.now();
  setInterval(() => {
    const cpuNow = process.cpuUsage(cpu);
    const wallNow = performance.now();
    console.log(
      JSON.stringify({
        metricas: 'processo',
        salas: processMetrics.rooms,
        jogadores: processMetrics.players,
        loopAtrasoP99Ms: Math.round(loop.percentile(99) / 1e4) / 100,
        cpuPct: Math.round(((cpuNow.user + cpuNow.system) / 1000 / (wallNow - wall)) * 1000) / 10,
        memoriaMB: Math.round(process.memoryUsage().rss / 1e6),
      }),
    );
    loop.reset();
    cpu = process.cpuUsage();
    wall = wallNow;
  }, intervalMs).unref();
}
