import { describe, expect, it } from 'vitest';
import {
  Scoring,
  envidoAccepted,
  envidoPoints,
  envidoRefused,
  faltaValue,
  florPoints,
  florRefused,
  florStake,
  gauderio,
  handWinner,
  hasFlor,
  nextEnvidoCalls,
  parseCardId,
  resolveTrick,
  type Card,
  type TrickOutcome,
} from '../src/index.ts';

const C = (id: string): Card => parseCardId(id)!;
const hand = (...ids: string[]) => ids.map(C);
const G = gauderio();

describe('Envido: pontos', () => {
  it('duas do mesmo naipe somam mais 20; figuras valem zero', () => {
    expect(envidoPoints(hand('7-ouros', '6-ouros', '1-espadas'))).toBe(33);
    expect(envidoPoints(hand('5-copas', '3-copas', '12-bastos'))).toBe(28);
    expect(envidoPoints(hand('12-espadas', '11-espadas', '4-ouros'))).toBe(20);
  });

  it('três naipes diferentes: vale a maior carta sozinha', () => {
    expect(envidoPoints(hand('4-ouros', '7-bastos', '6-copas'))).toBe(7);
    expect(envidoPoints(hand('10-ouros', '11-bastos', '12-copas'))).toBe(0);
  });

  it('o máximo é 33; com três do mesmo naipe (Flor desligada) valem as duas melhores', () => {
    const all = ['espadas', 'bastos', 'ouros', 'copas'].flatMap((s) => [1, 2, 3, 4, 5, 6, 7, 10, 11, 12].map((r) => C(`${r}-${s}`)));
    let max = 0;
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) for (let k = j + 1; k < all.length; k++) max = Math.max(max, envidoPoints([all[i]!, all[j]!, all[k]!]));
    expect(max).toBe(33);
    expect(envidoPoints(hand('7-copas', '6-copas', '5-copas'))).toBe(33);
  });
});

describe('Envido: cantos e valores', () => {
  it('sequências legais: dois Envidos no máximo, Real e depois Falta', () => {
    expect(nextEnvidoCalls([])).toEqual(['envido', 'real-envido', 'falta-envido']);
    expect(nextEnvidoCalls(['envido'])).toEqual(['envido', 'real-envido', 'falta-envido']);
    expect(nextEnvidoCalls(['envido', 'envido'])).toEqual(['real-envido', 'falta-envido']);
    expect(nextEnvidoCalls(['real-envido'])).toEqual(['falta-envido']);
    expect(nextEnvidoCalls(['envido', 'falta-envido'])).toEqual([]);
  });

  it('tabela do regulamento: aceito e recusado', () => {
    const rows: [Parameters<typeof envidoAccepted>[1], number, number][] = [
      [['envido'], 2, 1],
      [['envido', 'envido'], 4, 2],
      [['real-envido'], 3, 1],
      [['envido', 'real-envido'], 5, 2],
      [['envido', 'envido', 'real-envido'], 7, 4],
    ];
    for (const [chain, accepted, refused] of rows) {
      expect(envidoAccepted(G, chain, 99)).toBe(accepted);
      expect(envidoRefused(G, chain)).toBe(refused);
    }
    // Falta: o valor vem do placar; a recusa vale o que estava estabelecido antes dela.
    expect(envidoAccepted(G, ['envido', 'falta-envido'], 8)).toBe(8);
    expect(envidoRefused(G, ['falta-envido'])).toBe(1);
    expect(envidoRefused(G, ['envido', 'envido', 'real-envido', 'falta-envido'])).toBe(7);
  });

  it('Falta = meta menos o placar de quem está na frente', () => {
    expect(faltaValue(G, [10, 16])).toBe(8);
    expect(faltaValue(G, [0, 0])).toBe(24);
    expect(faltaValue(gauderio({ goal: 12 }), [3, 5])).toBe(7);
    expect(faltaValue(G, [23, 2])).toBe(1);
  });
});

describe('Flor', () => {
  it('três do mesmo naipe; pontos = soma + 20 (figuras zero)', () => {
    expect(hasFlor(hand('7-espadas', '6-espadas', '5-espadas'))).toBe(true);
    expect(hasFlor(hand('7-espadas', '6-espadas', '5-copas'))).toBe(false);
    expect(florPoints(hand('7-espadas', '6-espadas', '5-espadas'))).toBe(38);
    expect(florPoints(hand('12-ouros', '11-ouros', '10-ouros'))).toBe(20);
  });

  it('valores do perfil GAUDERIO_24', () => {
    // Duas Flores em disputa: 3 por Flor; Contra-Flor dobra; Contra-Flor e o Resto vale a Falta.
    expect(florStake(G, 2, [], 24)).toBe(6);
    expect(florStake(G, 2, ['contra-flor'], 24)).toBe(12);
    expect(florStake(G, 3, ['contra-flor'], 24)).toBe(18);
    expect(florStake(G, 2, ['contra-flor', 'contra-flor-resto'], 9)).toBe(9);
    // Recusa: o nível estabelecido antes do último aumento.
    expect(florRefused(G, 2, [], 24)).toBe(6);
    expect(florRefused(G, 2, ['contra-flor'], 24)).toBe(6);
    expect(florRefused(G, 2, ['contra-flor', 'contra-flor-resto'], 9)).toBe(12);
    expect(florRefused(G, 2, ['contra-flor-resto'], 9)).toBe(6);
  });
});

describe('vazas e pardas', () => {
  it('a carta mais forte leva; parceiros empatados levam juntos; equipes empatadas fazem parda', () => {
    expect(resolveTrick([{ seat: 0, card: C('3-copas') }, { seat: 1, card: C('1-espadas') }])).toEqual({ outcome: 1, winnerSeat: 1 });
    expect(resolveTrick([{ seat: 0, card: C('3-copas') }, { seat: 1, card: C('3-ouros') }])).toEqual({ outcome: 'parda', winnerSeat: null });
    const partners = [
      { seat: 1, card: C('3-copas') },
      { seat: 2, card: C('5-ouros') },
      { seat: 3, card: C('3-espadas') },
      { seat: 0, card: C('4-bastos') },
    ];
    expect(resolveTrick(partners)).toEqual({ outcome: 1, winnerSeat: 1 });
  });

  it('todas as regras de parda', () => {
    const w = (r: TrickOutcome[], mano: 0 | 1 = 0) => handWinner(r, mano);
    expect(w([0, 0])).toBe(0);
    expect(w([0])).toBeNull();
    expect(w(['parda', 1])).toBe(1); // parda na primeira: decide a segunda
    expect(w([0, 'parda'])).toBe(0); // ganhou a primeira e empatou a segunda
    expect(w([0, 1])).toBeNull();
    expect(w([0, 1, 'parda'])).toBe(0); // uma para cada e parda na terceira: quem ganhou a primeira
    expect(w([0, 1, 1])).toBe(1);
    expect(w(['parda', 'parda'])).toBeNull();
    expect(w(['parda', 'parda', 1])).toBe(1); // duas pardas: a terceira decide
    expect(w(['parda', 'parda', 'parda'], 1)).toBe(1); // três pardas: o mão
    expect(w(['parda', 'parda', 'parda'], 0)).toBe(0);
  });
});

describe('placar', () => {
  it('a mesma aposta não pontua duas vezes; depois da meta nada entra', () => {
    const s = new Scoring(12);
    expect(s.award('1:envido', 1, 'envido', 'Envido', 0, 2)).toBe(true);
    expect(s.award('1:envido', 1, 'envido', 'Envido', 0, 2)).toBe(false);
    expect(s.score).toEqual([2, 0]);
    s.award('1:mao', 1, 'truco', 'Vale Quatro ganho', 1, 12);
    expect(s.winner).toBe(1);
    expect(s.award('2:mao', 2, 'truco', 'Mão ganha', 0, 1)).toBe(false);
    expect(s.history.map((h) => h.score)).toEqual([[2, 0], [2, 12]]);
  });
});
