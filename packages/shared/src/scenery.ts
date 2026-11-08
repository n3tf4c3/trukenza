/** Cenários próprios, sincronizados pela sala. */
export const SCENERIES = {
  bolicho: { name: 'Bolicho', description: 'Madeira, lampião e prosa gaúcha.' },
  praia: { name: 'Praia', description: 'Mar azul, coqueiros e brisa leve.' },
  parque: { name: 'Parque', description: 'Árvores, flores e um fim de tarde dourado.' },
  vegas: { name: 'Las Vegas', description: 'Neons, fontes e as luzes da cidade.' },
  paris: { name: 'Paris', description: 'Café ao ar livre e a Torre Eiffel ao fundo.' },
  china: { name: 'Jardim chinês', description: 'Lago, lanternas e um pavilhão vermelho.' },
  japao: { name: 'Jardim japonês', description: 'Cerejeiras, ponte e um portal torii.' },
  muralha: { name: 'Muralha da China', description: 'Torres e muralhas entre montanhas.' },
  fuji: { name: 'Monte Fuji', description: 'Lago tranquilo e o vulcão de cume nevado.' },
  cataratas: { name: 'Cataratas', description: 'Quedas-d’água, mata e névoa suave.' },
} as const;
export type SceneryId = keyof typeof SCENERIES;
export const SCENERY_IDS = Object.keys(SCENERIES) as SceneryId[];
export const DEFAULT_SCENERY: SceneryId = 'bolicho';
export const MSG_SCENERY = 'cenario';
export function parseScenery(raw: unknown): SceneryId | null {
  return typeof raw === 'string' && Object.hasOwn(SCENERIES, raw) ? raw as SceneryId : null;
}
export function parseSceneryMessage(raw: unknown): SceneryId | null {
  return typeof raw === 'object' && raw !== null ? parseScenery((raw as Record<string, unknown>).scenery) : null;
}
