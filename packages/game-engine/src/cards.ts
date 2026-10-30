/**
 * Baralho espanhol de 40 cartas (sem 8, 9 e curingas) e a hierarquia do truco.
 * A hierarquia é a mesma nas variantes mais jogadas (argentina, uruguaia e gaúcha);
 * pontuação, Envido e Flor variam e ficam para quando a variante-base for decidida (docs/regras.md).
 */

export const SUITS = ['espadas', 'bastos', 'ouros', 'copas'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const SUIT_NAMES: Record<Suit, string> = { espadas: 'Espadas', bastos: 'Paus', ouros: 'Ouros', copas: 'Copas' };
export const RANK_NAMES: Record<Rank, string> = {
  1: 'Ás', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 10: 'Sota', 11: 'Cavalo', 12: 'Rei',
};

/** "1-espadas": identificador estável, usado na rede. */
export function cardId(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

/** Lê o identificador vindo da rede; qualquer outra coisa devolve null. */
export function parseCardId(raw: unknown): Card | null {
  if (typeof raw !== 'string') return null;
  const [r, s, extra] = raw.split('-');
  const rank = Number(r);
  if (extra !== undefined || !(RANKS as readonly number[]).includes(rank) || !(SUITS as readonly unknown[]).includes(s)) return null;
  const card = { rank: rank as Rank, suit: s as Suit };
  // Só a forma canônica: "01-ouros" não é o mesmo texto e escaparia das comparações por id.
  return cardId(card) === raw ? card : null;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
}

/**
 * Força da carta no truco (maior vence). Do topo para baixo:
 * 1 de espadas, 1 de paus, 7 de espadas, 7 de ouros, os 3, os 2, 1 de ouros e de copas,
 * os 12, os 11, os 10, 7 de paus e de copas, os 6, os 5 e os 4.
 * Cartas de mesma força empatam (a "parda").
 */
export function trucoPower(card: Card): number {
  const { rank, suit } = card;
  if (rank === 1 && suit === 'espadas') return 14;
  if (rank === 1 && suit === 'bastos') return 13;
  if (rank === 7 && suit === 'espadas') return 12;
  if (rank === 7 && suit === 'ouros') return 11;
  switch (rank) {
    case 3: return 10;
    case 2: return 9;
    case 1: return 8;
    case 12: return 7;
    case 11: return 6;
    case 10: return 5;
    case 7: return 4;
    case 6: return 3;
    case 5: return 2;
    default: return 1;
  }
}

/** Positivo se `a` vence, negativo se `b` vence, 0 se empatam. */
export function compareCards(a: Card, b: Card): number {
  return trucoPower(a) - trucoPower(b);
}

/** Valor da carta para Envido e Flor (diferente da força na vaza): 1 a 7 valem o número; as figuras, zero. */
export function envidoValue(card: Card): number {
  return card.rank >= 10 ? 0 : card.rank;
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}
