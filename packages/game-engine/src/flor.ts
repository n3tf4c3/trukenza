import { envidoValue, type Card } from './cards.ts';
import type { SpanishRulesConfig } from './config.ts';

/** Flor: as três cartas do mesmo naipe. */
export function hasFlor(hand: readonly Card[]): boolean {
  return hand.length === 3 && hand.every((c) => c.suit === hand[0]!.suit);
}

/** Pontos de Flor para comparar duas Flores: a soma das três (figuras valem zero) mais 20. */
export function florPoints(hand: readonly Card[]): number {
  return 20 + hand.reduce((n, c) => n + envidoValue(c), 0);
}

export const FLOR_RAISES = ['contra-flor', 'contra-flor-resto'] as const;
export type FlorRaise = (typeof FLOR_RAISES)[number];

/** Aumentos ainda possíveis numa disputa de Flor (Contra-Flor e depois Contra-Flor e o Resto, sem pular a ordem inversa). */
export function nextFlorRaises(chain: readonly FlorRaise[]): FlorRaise[] {
  if (chain.includes('contra-flor-resto')) return [];
  return chain.includes('contra-flor') ? ['contra-flor-resto'] : ['contra-flor', 'contra-flor-resto'];
}

/**
 * Valor de uma disputa de Flor no perfil GAUDERIO_24. `flores` = Flores anunciadas na mão (das duas equipes).
 * - Básica (as duas equipes têm Flor): 3 por Flor participante.
 * - Contra-Flor aceita: o dobro da básica.
 * - Contra-Flor e o Resto: a Falta.
 */
export function florStake(config: SpanishRulesConfig, flores: number, chain: readonly FlorRaise[], falta: number): number {
  const basic = config.florValues.perFlor * flores;
  if (chain.includes('contra-flor-resto')) return falta;
  return chain.includes('contra-flor') ? basic * config.florValues.contraFlorMultiplier : basic;
}

/** Recusa (Me Achico): quem propôs leva o nível estabelecido antes do último aumento (a básica, se não houve aumento aceito). */
export function florRefused(config: SpanishRulesConfig, flores: number, chain: readonly FlorRaise[], falta: number): number {
  return florStake(config, flores, chain.slice(0, -1), falta);
}
