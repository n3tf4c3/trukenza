/** Convenção do Trukenza para o Gaudério. O jogador escolhe; não se consulta sua mão. */
export const SIGNALS = {
  sobrancelhas: { label: 'Erguer sobrancelhas', meaning: 'Ás de espadas' },
  piscada: { label: 'Piscar um olho', meaning: 'Ás de paus' },
  'boca-direita': { label: 'Boca à direita', meaning: '7 de espadas' },
  'boca-esquerda': { label: 'Boca à esquerda', meaning: '7 de ouros' },
  labio: { label: 'Morder o lábio', meaning: 'Um 3' },
  bico: { label: 'Fazer bico', meaning: 'Um 2' },
  'boca-aberta': { label: 'Abrir a boca', meaning: 'Ás de copas ou ouros' },
  cabeca: { label: 'Inclinar a cabeça', meaning: 'Envido de 27 a 29' },
  nariz: { label: 'Franzir o nariz', meaning: 'Envido de 30 ou mais' },
  olhos: { label: 'Fechar os olhos', meaning: 'Mão fraca' },
} as const;
export type SignalId = keyof typeof SIGNALS;
export const SIGNAL_IDS = Object.keys(SIGNALS) as SignalId[];
export const SIGNAL_DURATION_MS = 1800;
export const SIGNAL_COOLDOWN_MS = 2500;
export const MSG_SIGNAL = 'sinal';
export const MSG_TABLE_SIGNAL = 'sinal-mesa';
export interface SignalRequest { signal: SignalId; hand: number }
export interface TableSignal extends SignalRequest { id: number; seat: number }

export function parseSignalRequest(raw: unknown): SignalRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.signal !== 'string' || !Object.hasOwn(SIGNALS, r.signal) ||
      typeof r.hand !== 'number' || !Number.isSafeInteger(r.hand) || r.hand < 1) return null;
  return { signal: r.signal as SignalId, hand: r.hand };
}

export function parseTableSignal(raw: unknown): TableSignal | null {
  const request = parseSignalRequest(raw);
  if (!request) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'number' || !Number.isSafeInteger(r.id) || r.id < 1 ||
      typeof r.seat !== 'number' || !Number.isInteger(r.seat) || r.seat < 0 || r.seat > 3) return null;
  return { ...request, id: r.id, seat: r.seat };
}
