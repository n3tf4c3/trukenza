import { createDeck, type Card } from './cards.ts';

export const HAND_SIZE = 3;

/** Gerador determinístico (mulberry32): a mesma semente dá a mesma sequência, no servidor e nos testes. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates sobre uma cópia; o original fica intacto. */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export interface Deal {
  /** Uma mão de HAND_SIZE cartas por jogador, na ordem das cadeiras. */
  hands: Card[][];
  /** O que sobrou do baralho. */
  rest: Card[];
}

/** Embaralha o baralho inteiro e dá as cartas uma a uma, em rodízio, como na mesa. */
export function deal(players: number, seed: number): Deal {
  if (!Number.isInteger(players) || players < 2 || players * HAND_SIZE > 40) throw new Error(`número de jogadores inválido: ${players}`);
  const deck = shuffle(createDeck(), seededRandom(seed));
  const hands: Card[][] = Array.from({ length: players }, () => []);
  for (let round = 0; round < HAND_SIZE; round++) {
    for (let p = 0; p < players; p++) hands[p]!.push(deck.shift()!);
  }
  return { hands, rest: deck };
}
