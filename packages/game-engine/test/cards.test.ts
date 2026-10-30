import { describe, expect, it } from 'vitest';
import { HAND_SIZE, cardId, compareCards, createDeck, deal, parseCardId, seededRandom, shuffle, trucoPower, type Card } from '../src/index.ts';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('baralho', () => {
  it('tem 40 cartas distintas, sem 8 e 9', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(40);
    expect(new Set(deck.map(cardId)).size).toBe(40);
    expect(deck.some((card) => (card.rank as number) === 8 || (card.rank as number) === 9)).toBe(false);
  });

  it('o identificador vai e volta; lixo é recusado', () => {
    for (const card of createDeck()) expect(parseCardId(cardId(card))).toEqual(card);
    for (const bad of ['8-espadas', '1-coroas', '1-espadas-x', '', 7, null, '01-ouros']) {
      expect(parseCardId(bad)).toBeNull();
    }
  });
});

describe('hierarquia do truco', () => {
  it('segue a ordem das cartas bravas e depois os números', () => {
    const order = [
      c(1, 'espadas'), c(1, 'bastos'), c(7, 'espadas'), c(7, 'ouros'),
      c(3, 'copas'), c(2, 'ouros'), c(1, 'copas'), c(12, 'bastos'), c(11, 'espadas'),
      c(10, 'ouros'), c(7, 'copas'), c(6, 'espadas'), c(5, 'bastos'), c(4, 'ouros'),
    ];
    for (let i = 0; i + 1 < order.length; i++) expect(compareCards(order[i]!, order[i + 1]!)).toBeGreaterThan(0);
  });

  it('cartas comuns de mesmo número empatam; as bravas não', () => {
    expect(compareCards(c(3, 'espadas'), c(3, 'copas'))).toBe(0);
    expect(compareCards(c(1, 'ouros'), c(1, 'copas'))).toBe(0);
    expect(compareCards(c(7, 'bastos'), c(7, 'copas'))).toBe(0);
    expect(compareCards(c(7, 'espadas'), c(7, 'ouros'))).toBeGreaterThan(0);
  });

  it('cobre o baralho com 14 níveis', () => {
    expect(new Set(createDeck().map(trucoPower)).size).toBe(14);
  });
});

describe('distribuição', () => {
  it('a mesma semente dá as mesmas mãos; sementes diferentes, outras', () => {
    expect(deal(4, 42)).toEqual(deal(4, 42));
    expect(deal(4, 42).hands).not.toEqual(deal(4, 43).hands);
  });

  it('dá 3 cartas a cada jogador, sem repetir, e o resto fica no monte', () => {
    for (const players of [2, 4]) {
      const { hands, rest } = deal(players, 7);
      expect(hands).toHaveLength(players);
      for (const hand of hands) expect(hand).toHaveLength(HAND_SIZE);
      const all = [...hands.flat(), ...rest].map(cardId);
      expect(all).toHaveLength(40);
      expect(new Set(all).size).toBe(40);
    }
  });

  it('recusa número de jogadores impossível', () => {
    expect(() => deal(1, 1)).toThrow();
    expect(() => deal(14, 1)).toThrow();
  });

  it('o embaralhamento não altera o original e é uma permutação', () => {
    const deck = createDeck();
    const copy = [...deck];
    const mixed = shuffle(deck, seededRandom(1));
    expect(deck).toEqual(copy);
    expect(mixed.map(cardId).sort()).toEqual(copy.map(cardId).sort());
    expect(mixed).not.toEqual(copy);
  });
});
