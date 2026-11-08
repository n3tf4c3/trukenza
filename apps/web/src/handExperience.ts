import type { HandSummary, MatchView } from '@trukenza/game-engine';

/** Revanche reinicia os ids; entrar/reconectar não reencena eventos antigos. */
export function eventCursor(previous: Pick<MatchView, 'winner'> | null, next: Pick<MatchView, 'winner' | 'events'> | null, last: number): number {
  if (!next) return -1;
  if (previous?.winner != null && next.winner === null) return 0;
  return last < 0 ? next.events.at(-1)?.id ?? 0 : last;
}

export function handExplanation(summary: HandSummary): string {
  const { ended, outcomes: o } = summary;
  if (ended.reason === 'recusa') return 'O pedido de Truco foi recusado.';
  if (ended.reason === 'baralho') return 'O outro lado foi ao baralho.';
  if (ended.reason === 'partida') return 'Os pontos do canto completaram a meta da partida.';
  if (o.every(v => v === 'parda')) return 'Três pardas: venceu o lado do mão.';
  if (o[0] === 'parda') return o[1] === 'parda' ? 'Duas pardas: a terceira vaza decidiu.' : 'Primeira parda: a segunda vaza decidiu.';
  if (o[1] === 'parda') return 'Ganhou a primeira vaza e empatou a segunda.';
  if (o[2] === 'parda') return 'Uma vaza para cada lado; a terceira parda deu a mão a quem ganhou a primeira.';
  return 'Ganhou duas vazas.';
}

export interface CardSelection { id: string; version: number }
export function validSelection(selection: CardSelection | null, version: number, playable: readonly string[]): string | null {
  return selection?.version === version && playable.includes(selection.id) ? selection.id : null;
}

/** Atalhos não interceptam digitação, botões focados, repetição nem combinações do navegador. */
export function cardShortcut(key: string, blocked: boolean, repeat = false, modifier = false): number | 'play' | 'clear' | null {
  if (blocked || repeat || modifier) return null;
  if (/^[123]$/.test(key)) return Number(key) - 1;
  if (key === 'Enter') return 'play';
  if (key === 'Escape') return 'clear';
  return null;
}

export const TIPS = {
  cadeira: 'Escolha uma cadeira e marque Estou pronto. O anfitrião começa quando todos confirmarem.',
  cartas: 'Toque numa carta para selecioná-la e confirme em Jogar. No teclado: 1–3, depois Enter. Esc cancela.',
  resposta: 'Antes de responder, confira os tentos abaixo de Quero e Não quero. O relógio continua contando.',
  sinais: 'Em dupla, use Sinais para gesticular. Todos podem ver; seu parceiro computador pode confiar até num blefe.',
  resumo: 'O resumo explica a mão e seus pontos. Na próxima mão ele fica recolhido para consultar quando quiser.',
} as const;
export type TipId = keyof typeof TIPS;
export function parseSeenTips(raw: string | null): TipId[] {
  try {
    const ids: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(ids) ? [...new Set(ids.filter((id): id is TipId => typeof id === 'string' && Object.hasOwn(TIPS, id)))] : [];
  } catch { return []; }
}
