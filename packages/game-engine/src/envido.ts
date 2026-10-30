import { envidoValue, type Card } from './cards.ts';
import type { SpanishRulesConfig } from './config.ts';

/**
 * Pontos de Envido de uma mão: com duas cartas do mesmo naipe, as duas de maior soma mais 20; sem par de
 * naipe, o maior valor individual. Figuras valem zero; o máximo é 33 (7 e 6 do mesmo naipe).
 */
export function envidoPoints(hand: readonly Card[]): number {
  let best = Math.max(0, ...hand.map(envidoValue));
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      if (hand[i]!.suit === hand[j]!.suit) best = Math.max(best, 20 + envidoValue(hand[i]!) + envidoValue(hand[j]!));
    }
  }
  return best;
}

export const ENVIDO_CALLS = ['envido', 'real-envido', 'falta-envido'] as const;
export type EnvidoCall = (typeof ENVIDO_CALLS)[number];

/**
 * Máquina de estados dos cantos: o que ainda pode ser cantado depois da sequência `chain`.
 * Envido aceita no máximo dois Envidos, depois Real Envido e por fim Falta Envido; nada depois da Falta.
 */
export function nextEnvidoCalls(chain: readonly EnvidoCall[]): EnvidoCall[] {
  if (chain.includes('falta-envido')) return [];
  if (chain.includes('real-envido')) return ['falta-envido'];
  return chain.filter((c) => c === 'envido').length >= 2 ? ['real-envido', 'falta-envido'] : ['envido', 'real-envido', 'falta-envido'];
}

function sum(config: SpanishRulesConfig, chain: readonly EnvidoCall[]): number {
  return chain.reduce((n, c) => n + (c === 'envido' ? config.envido.envido : c === 'real-envido' ? config.envido.realEnvido : 0), 0);
}

/** Valor da disputa aceita: a soma dos cantos, ou a Falta (calculada pelo placar do momento) se ela foi cantada. */
export function envidoAccepted(config: SpanishRulesConfig, chain: readonly EnvidoCall[], falta: number): number {
  return chain.includes('falta-envido') ? falta : sum(config, chain);
}

/** Valor da recusa: a soma dos cantos já estabelecidos antes do último, no mínimo 1. */
export function envidoRefused(config: SpanishRulesConfig, chain: readonly EnvidoCall[]): number {
  return Math.max(config.envido.refusedMin, sum(config, chain.slice(0, -1)));
}
