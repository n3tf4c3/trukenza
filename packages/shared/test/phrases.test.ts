import { describe, expect, it } from 'vitest';
import { PHRASE_GROUPS, PHRASE_IDS, PHRASES, parsePhraseRequest, parseTablePhrase } from '../src/phrases.ts';

describe('frases rápidas', () => {
  it('o catálogo tem texto curto, grupo conhecido e nenhum id repetido', () => {
    expect(new Set(PHRASE_IDS).size).toBe(PHRASE_IDS.length);
    expect(Object.keys(PHRASES).sort()).toEqual([...PHRASE_IDS].sort());
    for (const id of PHRASE_IDS) {
      expect(PHRASE_GROUPS[PHRASES[id].group]).toBeTruthy();
      expect(PHRASES[id].text.length).toBeGreaterThan(3);
      expect(PHRASES[id].text.length).toBeLessThanOrEqual(32);
    }
  });
  it('aceita só frases do catálogo e descarta texto livre, cadeira e campos extras', () => {
    for (const phrase of PHRASE_IDS) expect(parsePhraseRequest({ phrase, seat: 3, text: 'oi' })).toEqual({ phrase });
    for (const raw of [null, 'medo', {}, { phrase: 'Tá com medo, tchê?' }, { phrase: '__proto__' },
      { phrase: 'constructor' }, { phrase: 'toString' }, { phrase: 7 }]) {
      expect(parsePhraseRequest(raw)).toBeNull();
    }
  });
  it('valida o evento de mesa', () => {
    expect(parseTablePhrase({ phrase: 'saude', seat: 1, id: 4, text: 'x' })).toEqual({ phrase: 'saude', seat: 1, id: 4 });
    for (const seat of [-1, 4, 1.5, '1']) expect(parseTablePhrase({ phrase: 'saude', seat, id: 1 })).toBeNull();
    for (const id of [0, -2, 1.5, '3']) expect(parseTablePhrase({ phrase: 'saude', seat: 0, id })).toBeNull();
  });
});
