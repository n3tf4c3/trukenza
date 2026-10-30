import { describe, expect, it } from 'vitest';
import { SpanishMatch, botAction, botContests, gauderio, parseCardId, seededRandom, type ActionType, type Card, type Goal } from '../src/index.ts';

const C = (id: string): Card => parseCardId(id)!;

/** Partida com as cartas fixas; o mão é a cadeira 0. */
function game(hands: string[][], options: { goal?: Goal; flor?: boolean } = {}): SpanishMatch {
  const m = new SpanishMatch(gauderio(options), hands.length as 2 | 4, 1);
  m.setDealerForTests(hands.length - 1);
  m.startHand(hands.map((h) => h.map(C)));
  return m;
}

function act(m: SpanishMatch, seat: number, type: ActionType, card?: string): void {
  const r = m.apply(seat, { type, card: card ? C(card) : undefined });
  if (!r.ok) throw new Error(`cadeira ${seat} não pôde ${type} ${card ?? ''}: ${r.error}`);
}

const types = (m: SpanishMatch, seat: number) => [...new Set(m.legalActions(seat).map((a) => a.type))];

// Sem Flor (naipes misturados). A: Envido 28, cartas fortes. B: Envido 6, cartas fracas.
const A = ['1-espadas', '7-espadas', '3-copas'];
const B = ['4-ouros', '5-bastos', '6-copas'];

describe('distribuição e turnos', () => {
  it('cada um recebe três cartas; o mão é quem está à direita de quem distribui', () => {
    const m = new SpanishMatch(gauderio(), 4, 9);
    m.startHand();
    const v = m.view().hand!;
    expect(v.cardsLeft).toEqual([3, 3, 3, 3]);
    expect(v.mano).toBe((v.dealer + 1) % 4);
    expect(v.turn).toBe(v.mano);
  });

  it('não dá para jogar fora da vez, nem carta que não está na mão, nem a mesma carta duas vezes', () => {
    const m = game([A, B]);
    expect(m.apply(1, { type: 'jogar', card: C('4-ouros') })).toEqual({ ok: false, error: 'acao-invalida' });
    expect(m.apply(0, { type: 'jogar', card: C('2-ouros') })).toEqual({ ok: false, error: 'carta-invalida' });
    act(m, 0, 'jogar', '3-copas');
    expect(m.apply(0, { type: 'jogar', card: C('3-copas') })).toEqual({ ok: false, error: 'acao-invalida' });
  });

  it('o vencedor da vaza abre a seguinte; ao fim da mão o distribuidor gira', () => {
    const m = game([A, B]);
    act(m, 0, 'jogar', '3-copas');
    act(m, 1, 'jogar', '4-ouros');
    expect(m.view().hand!.turn).toBe(0);
    act(m, 0, 'jogar', '1-espadas');
    act(m, 1, 'jogar', '5-bastos');
    const v = m.view();
    expect(v.hand!.ended).toEqual({ winnerTeam: 0, reason: 'vazas', value: 1 });
    expect(v.score).toEqual([1, 0]);
    m.nextHand();
    expect(m.view().hand!.dealer).toBe(0);
    expect(m.view().hand!.mano).toBe(1);
  });

  it('parda na primeira: abre o mão e a segunda decide', () => {
    const m = game([['3-copas', '4-copas', '5-espadas'], ['3-ouros', '1-espadas', '6-bastos']]);
    act(m, 0, 'jogar', '3-copas');
    act(m, 1, 'jogar', '3-ouros');
    const v = m.view().hand!;
    expect(v.tricks[0]!.outcome).toBe('parda');
    expect(v.turn).toBe(0);
    act(m, 0, 'jogar', '4-copas');
    act(m, 1, 'jogar', '1-espadas');
    expect(m.view().hand!.ended?.winnerTeam).toBe(1);
  });
});

describe('Truco, Retruco e Vale Quatro', () => {
  it('Truco aceito vale 2', () => {
    const m = game([A, B]);
    act(m, 0, 'truco');
    expect(types(m, 0)).toEqual([]);
    // O mão pediu antes de a outra ter a vez do Envido: dá para contestar.
    expect(types(m, 1)).toEqual(['quero', 'nao-quero', 'retruco', 'envido', 'real-envido', 'falta-envido', 'contestar', 'baralho']);
    act(m, 1, 'quero');
    act(m, 0, 'jogar', '1-espadas');
    act(m, 1, 'jogar', '4-ouros');
    act(m, 0, 'jogar', '7-espadas');
    act(m, 1, 'jogar', '5-bastos');
    expect(m.view().score).toEqual([2, 0]);
    expect(m.view().history.at(-1)).toMatchObject({ kind: 'truco', detail: 'Truco ganho', value: 2, team: 0 });
  });

  it('Truco recusado dá 1 a quem pediu e acaba a mão', () => {
    const m = game([A, B]);
    act(m, 0, 'truco');
    act(m, 1, 'nao-quero');
    expect(m.view().score).toEqual([1, 0]);
    expect(m.view().hand!.ended?.reason).toBe('recusa');
  });

  it('Retruco e Vale Quatro como resposta; a recusa vale o nível anterior', () => {
    const m = game([A, B]);
    act(m, 0, 'truco');
    act(m, 1, 'retruco');
    expect(types(m, 0)).toContain('vale-quatro');
    act(m, 0, 'vale-quatro');
    expect(types(m, 1)).toEqual(['quero', 'nao-quero', 'baralho']);
    act(m, 1, 'nao-quero');
    expect(m.view().score).toEqual([3, 0]);
  });

  it('sem pular etapas e sem dois aumentos seguidos da mesma equipe', () => {
    const m = game([A, B]);
    expect(m.apply(0, { type: 'retruco' }).ok).toBe(false);
    expect(m.apply(0, { type: 'vale-quatro' }).ok).toBe(false);
    act(m, 0, 'truco');
    act(m, 1, 'quero');
    // Quem pediu não pode aumentar de novo; o direito agora é de quem aceitou.
    expect(types(m, 0)).not.toContain('retruco');
    act(m, 0, 'jogar', '3-copas');
    expect(types(m, 1)).toContain('retruco');
    expect(types(m, 1)).not.toContain('vale-quatro');
    act(m, 1, 'retruco');
    act(m, 0, 'quero');
    expect(m.view().hand!.truco).toMatchObject({ level: 3, raiseRight: 0, pending: null });
    act(m, 1, 'jogar', '4-ouros');
    expect(types(m, 0)).toContain('vale-quatro');
  });

  it('resposta repetida não vale duas vezes', () => {
    const m = game([A, B]);
    act(m, 0, 'truco');
    act(m, 1, 'quero');
    expect(m.apply(1, { type: 'quero' })).toEqual({ ok: false, error: 'acao-invalida' });
    expect(m.view().hand!.truco.level).toBe(2);
  });
});

describe('Envido', () => {
  it('aceito: ganha o maior Envido; recusado: 1 para quem cantou', () => {
    const m = game([A, B]);
    act(m, 0, 'envido');
    act(m, 1, 'quero');
    expect(m.view().hand!.envido.result).toMatchObject({ accepted: true, winnerTeam: 0, value: 2, best: [28, 6] });
    expect(m.view().score).toEqual([2, 0]);

    const r = game([A, B]);
    act(r, 0, 'envido');
    act(r, 1, 'nao-quero');
    expect(r.view().score).toEqual([1, 0]);
  });

  it('Envido + Real Envido: 5 aceito, 2 recusado; terceiro Envido é ilegal', () => {
    const m = game([A, B]);
    act(m, 0, 'envido');
    act(m, 1, 'real-envido');
    act(m, 0, 'quero');
    expect(m.view().score).toEqual([5, 0]);

    const r = game([A, B]);
    act(r, 0, 'envido');
    act(r, 1, 'real-envido');
    act(r, 0, 'nao-quero');
    expect(r.view().score).toEqual([0, 2]);

    const x = game([A, B]);
    act(x, 0, 'envido');
    act(x, 1, 'envido');
    expect(x.apply(0, { type: 'envido' }).ok).toBe(false);
    act(x, 0, 'real-envido');
    act(x, 1, 'quero');
    expect(x.view().score).toEqual([7, 0]);
  });

  it('Falta Envido pelo placar do momento', () => {
    const m = game([A, B]);
    m.scoring.score = [10, 16];
    act(m, 0, 'falta-envido');
    act(m, 1, 'quero');
    expect(m.view().hand!.envido.result!.value).toBe(8);
    expect(m.view().score).toEqual([18, 16]);
  });

  it('empate: ganha quem vem primeiro a partir do mão', () => {
    const m = game([['7-ouros', '6-ouros', '1-espadas'], ['7-copas', '6-copas', '1-bastos']]);
    act(m, 0, 'envido');
    act(m, 1, 'quero');
    expect(m.view().hand!.envido.result).toMatchObject({ winnerTeam: 0, best: [33, 33], winnerSeat: 0 });
  });

  it('só na primeira vaza e antes de jogar a primeira carta; Truco aceito fecha o Envido', () => {
    const m = game([A, B]);
    act(m, 0, 'jogar', '3-copas');
    expect(types(m, 1)).toContain('envido'); // a outra ainda não jogou
    act(m, 1, 'jogar', '4-ouros');
    expect(types(m, 0)).not.toContain('envido');

    const t = game([A, B]);
    act(t, 0, 'truco');
    act(t, 1, 'quero');
    expect(types(t, 0)).not.toContain('envido');
  });

  it('na dupla, só os dois últimos da primeira vaza abrem o Envido', () => {
    const m = game([A, B, ['2-espadas', '4-bastos', '6-ouros'], ['5-copas', '7-bastos', '12-ouros']]);
    expect(types(m, 0)).not.toContain('envido');
    act(m, 0, 'jogar', '3-copas');
    expect(types(m, 1)).not.toContain('envido');
    act(m, 1, 'jogar', '4-ouros');
    expect(types(m, 2)).toContain('envido');
    act(m, 2, 'jogar', '2-espadas');
    expect(types(m, 3)).toContain('envido');
  });

  it('Truco fica pendente enquanto o Envido é resolvido, e depois volta', () => {
    const m = game([A, B]);
    act(m, 0, 'truco');
    act(m, 1, 'envido');
    expect(m.view().hand!.decision).toBe('envido');
    expect(types(m, 0)).toEqual(['quero', 'nao-quero', 'envido', 'real-envido', 'falta-envido', 'baralho']);
    act(m, 0, 'quero');
    expect(m.view().score).toEqual([2, 0]);
    expect(m.view().hand!.decision).toBe('truco');
    expect(types(m, 1)).not.toContain('envido');
    act(m, 1, 'quero');
    expect(m.view().hand!.truco.level).toBe(2);
  });

  it('a partida acaba no Envido, sem jogar as vazas', () => {
    const m = game([A, B]);
    m.scoring.score = [22, 5];
    act(m, 0, 'envido');
    act(m, 1, 'quero');
    const v = m.view();
    expect(v.winner).toBe(0);
    expect(v.hand!.ended?.reason).toBe('partida');
    expect(m.apply(0, { type: 'jogar', card: C('1-espadas') })).toEqual({ ok: false, error: 'partida-encerrada' });
  });
});

describe('Flor', () => {
  const FLOR_COPAS = ['1-copas', '2-copas', '3-copas'];

  it('não é obrigatória: quem tem pode anunciá-la (3 sem oposição) ou escondê-la até a primeira carta', () => {
    const m = game([A, FLOR_COPAS]);
    act(m, 0, 'jogar', '3-copas');
    expect(types(m, 1)).toEqual(['jogar', 'truco', 'envido', 'real-envido', 'falta-envido', 'flor', 'baralho']);
    act(m, 1, 'flor');
    expect(m.view().score).toEqual([0, 3]);
    expect(types(m, 1)).toContain('jogar');

    const h = game([FLOR_COPAS, A]);
    expect(types(h, 0)).toContain('flor');
    act(h, 0, 'jogar', '1-copas');
    act(h, 1, 'jogar', '3-copas');
    act(h, 1, 'jogar', '7-espadas');
    expect(h.view().hand!.flor.announced).toEqual([]);
    expect(types(h, 0)).toEqual(['jogar', 'truco', 'baralho']);
  });

  it('responder ao Envido com a Flor anula o Envido', () => {
    const m = game([A, FLOR_COPAS]);
    act(m, 0, 'envido');
    expect(types(m, 1)).toEqual(['quero', 'nao-quero', 'envido', 'real-envido', 'falta-envido', 'flor', 'baralho']);
    act(m, 1, 'flor');
    const v = m.view().hand!;
    expect(v.envido.status).toBe('anulado');
    expect(v.envido.pending).toBeNull();
    expect(v.flor.announced).toEqual([1]);
    expect(m.view().score).toEqual([0, 3]);
    expect(types(m, 0)).not.toContain('envido');
  });

  it('duas Flores na mesma dupla somam 6', () => {
    const m = game([['1-copas', '2-copas', '3-copas'], B, ['4-espadas', '5-espadas', '6-espadas'], ['7-ouros', '12-bastos', '11-copas']]);
    act(m, 0, 'flor');
    expect(m.view().hand!.flor.announced).toEqual([0, 2]);
    expect(m.view().score).toEqual([6, 0]);
    expect(m.view().history.at(-1)!.detail).toBe('2 Flores');
  });

  const FLOR_31 = ['1-espadas', '7-espadas', '3-espadas']; // 31
  const FLOR_38 = ['7-copas', '6-copas', '5-copas']; // 38

  it('Flores das duas equipes: disputa básica, Me Achico e Contra-Flor', () => {
    const q = game([FLOR_31, FLOR_38]);
    act(q, 0, 'flor');
    expect(q.view().hand!.decision).toBe('flor');
    expect(types(q, 1)).toEqual(['quero', 'me-achico', 'contra-flor', 'contra-flor-resto']);
    act(q, 1, 'quero');
    expect(q.view().hand!.flor.result).toMatchObject({ contested: true, winnerTeam: 1, value: 6, best: [31, 38] });

    const a = game([FLOR_31, FLOR_38]);
    act(a, 0, 'flor');
    act(a, 1, 'me-achico');
    expect(a.view().score).toEqual([6, 0]);

    const cf = game([FLOR_31, FLOR_38]);
    act(cf, 0, 'flor');
    act(cf, 1, 'contra-flor');
    expect(types(cf, 0)).toEqual(['quero', 'me-achico', 'contra-flor-resto']);
    act(cf, 0, 'quero');
    expect(cf.view().score).toEqual([0, 12]);

    const cfr = game([FLOR_31, FLOR_38]);
    act(cfr, 0, 'flor');
    act(cfr, 1, 'contra-flor');
    act(cfr, 0, 'me-achico');
    expect(cfr.view().score).toEqual([0, 6]);
  });

  it('Contra-Flor e o Resto vale a Falta e pode acabar a partida', () => {
    const m = game([FLOR_31, FLOR_38]);
    m.scoring.score = [3, 14];
    act(m, 0, 'flor');
    act(m, 1, 'contra-flor-resto');
    expect(types(m, 0)).toEqual(['quero', 'me-achico']);
    act(m, 0, 'quero');
    expect(m.view().hand!.flor.result!.value).toBe(10);
    expect(m.view().winner).toBe(1);
    expect(m.view().hand!.ended?.reason).toBe('partida');
  });

  it('a Flor pode acabar a partida', () => {
    const m = game([A, FLOR_COPAS]);
    m.scoring.score = [0, 21];
    act(m, 0, 'jogar', '1-espadas');
    act(m, 1, 'flor');
    expect(m.view().winner).toBe(1);
  });

  it('com a Flor desligada, três do mesmo naipe é só Envido', () => {
    const m = game([A, FLOR_38], { flor: false });
    act(m, 0, 'jogar', '3-copas');
    expect(types(m, 1)).toContain('jogar');
    expect(types(m, 1)).toContain('envido');
  });
});

describe('Flor escondida: conferência no fim da mão', () => {
  const FLOR_33 = ['7-copas', '6-copas', '5-copas']; // Envido 33 (as duas melhores)

  it('quem perdeu o Envido contesta a Flor mostrada: os pontos do Envido passam para ele', () => {
    const m = game([FLOR_33, B]);
    act(m, 0, 'envido');
    act(m, 1, 'quero');
    expect(m.view().score).toEqual([2, 0]);
    act(m, 0, 'baralho');
    const v = m.view().hand!;
    expect(v.decision).toBe('conferencia');
    expect(v.actors).toEqual([1]);
    expect(v.review).toEqual({ team: 1, shown: [{ seat: 0, cards: FLOR_33 }] });
    expect(types(m, 0)).toEqual([]);
    expect(types(m, 1)).toEqual(['contestar']);
    expect(botContests(m, 1)).toBe(true);
    act(m, 1, 'contestar');
    expect(m.view().score).toEqual([0, 3]);
    expect(m.view().history.slice(-2).map((e) => [e.detail, e.team, e.value])).toEqual([
      ['Flor escondida', 0, -2],
      ['Flor escondida contestada', 1, 2],
    ]);
    expect(m.view().events.at(-1)).toMatchObject({ kind: 'contestacao', about: 'flor', ok: true, team: 0, value: 2 });
    expect(m.view().hand!.decision).toBe('nenhuma');
    expect(m.apply(1, { type: 'contestar' })).toEqual({ ok: false, error: 'mao-encerrada' });
  });

  it('sem Flor à vista a contestação não muda nada; sem contestar, a mão seguinte fecha a conferência', () => {
    const m = game([A, B]);
    act(m, 0, 'envido');
    act(m, 1, 'quero');
    act(m, 0, 'baralho');
    expect(botContests(m, 1)).toBe(false);
    act(m, 1, 'contestar');
    expect(m.view().score).toEqual([2, 1]);
    expect(m.view().events.at(-1)).toMatchObject({ kind: 'contestacao', ok: false, value: 0 });

    // Envido recusado: ninguém mostra as cartas, então a Flor escondida não fica à vista.
    const r = game([FLOR_33, B]);
    act(r, 0, 'envido');
    act(r, 1, 'nao-quero');
    act(r, 0, 'baralho');
    expect(r.view().hand!.review).toEqual({ team: 1, shown: [] });
    act(r, 1, 'contestar');
    expect(r.view().score).toEqual([1, 1]);

    const n = game([FLOR_33, B]);
    act(n, 0, 'envido');
    act(n, 1, 'quero');
    act(n, 0, 'baralho');
    n.nextHand();
    expect(n.view().hand!.review).toBeNull();
    expect(n.view().score).toEqual([2, 1]);
  });

  it('a Flor escondida também fica à vista quando as três cartas são jogadas', () => {
    // Cadeira 1 esconde a Flor (Envido 33), ganha o Envido recusado e joga as três cartas.
    const m = game([['4-bastos', '1-espadas', '12-ouros'], FLOR_33]);
    act(m, 0, 'jogar', '4-bastos');
    act(m, 1, 'envido');
    act(m, 0, 'nao-quero');
    act(m, 1, 'jogar', '7-copas');
    act(m, 1, 'jogar', '6-copas');
    act(m, 0, 'jogar', '1-espadas');
    act(m, 0, 'jogar', '12-ouros');
    act(m, 1, 'jogar', '5-copas');
    expect(m.view().hand!.review).toEqual({ team: 0, shown: [] });
    expect(botContests(m, 0)).toBe(true);
    act(m, 0, 'contestar');
    expect(m.view().score[1]).toBe(0);
  });

  it('com a Flor desligada não há conferência', () => {
    const m = game([FLOR_33, B], { flor: false });
    act(m, 0, 'envido');
    act(m, 1, 'quero');
    act(m, 0, 'baralho');
    expect(m.view().hand!.review).toBeNull();
    expect(types(m, 1)).toEqual([]);
  });
});

describe('Truco antes do Envido', () => {
  it('contestado: o Envido queima, a infratora perde 2 e o Truco continua esperando', () => {
    const m = game([A, B]);
    m.scoring.score = [5, 3];
    expect(m.trucoBeforeEnvido(0)).toBe(true);
    act(m, 0, 'truco');
    expect(m.view().hand!.foul).toEqual({ seat: 0, team: 0 });
    act(m, 1, 'contestar');
    const v = m.view();
    expect(v.score).toEqual([3, 3]);
    expect(v.history.at(-1)).toMatchObject({ kind: 'contestacao', detail: 'Truco antes do Envido', team: 0, value: -2 });
    expect(v.hand!.envido.status).toBe('queimado');
    expect(v.hand!.decision).toBe('truco');
    expect(types(m, 1)).toEqual(['quero', 'nao-quero', 'retruco', 'baralho']);
    act(m, 1, 'quero');
    expect(m.view().hand!.truco.level).toBe(2);
  });

  it('não contestado, fica por isso mesmo; com placar zerado, a penalidade não passa de zero', () => {
    const m = game([A, B]);
    act(m, 0, 'truco');
    act(m, 1, 'envido');
    expect(m.view().hand!.foul).toBeNull();
    act(m, 0, 'quero');
    expect(types(m, 1)).not.toContain('contestar');

    const z = game([A, B]);
    act(z, 0, 'truco');
    act(z, 1, 'contestar');
    expect(z.view().score).toEqual([0, 0]);
    expect(z.view().history.at(-1)!.value).toBe(0);
  });

  it('só vale para a equipe do mão, antes de a outra ter a vez do Envido', () => {
    // Mano a mano: o pé pede Truco depois de o mão jogar, e o Envido cantado antes tira a infração.
    const m = game([A, B]);
    act(m, 0, 'jogar', '3-copas');
    expect(m.trucoBeforeEnvido(1)).toBe(false);
    const e = game([A, B]);
    act(e, 0, 'envido');
    act(e, 1, 'quero');
    expect(e.trucoBeforeEnvido(0)).toBe(false);

    // Na dupla, só os dois últimos abrem o Envido: o parceiro do mão ainda comete a infração na 3ª cadeira.
    const q = game([A, B, ['2-espadas', '4-bastos', '6-ouros'], ['5-copas', '7-bastos', '12-ouros']]);
    act(q, 0, 'jogar', '3-copas');
    expect(q.trucoBeforeEnvido(1)).toBe(false);
    act(q, 1, 'jogar', '4-ouros');
    expect(q.trucoBeforeEnvido(2)).toBe(true);
    act(q, 2, 'truco');
    expect(types(q, 1)).toContain('contestar');
    expect(types(q, 3)).toContain('contestar');
  });

  it('o computador não comete a infração e contesta quando não tem Envido bom', () => {
    const m = game([A, B]);
    const rnd = seededRandom(3);
    for (let i = 0; i < 40; i++) expect(botAction(m, 0, rnd).type).not.toBe('truco');
    act(m, 0, 'truco');
    expect(botAction(m, 1, rnd).type).toBe('contestar');
  });
});

describe('Ir ao baralho', () => {
  it('na partida de dois, entrega o valor do Truco', () => {
    const m = game([A, B]);
    act(m, 0, 'baralho');
    expect(m.view().score).toEqual([0, 1]);
    expect(m.view().hand!.ended?.reason).toBe('baralho');

    const t = game([A, B]);
    act(t, 0, 'truco');
    act(t, 1, 'quero');
    act(t, 0, 'baralho');
    expect(t.view().score).toEqual([0, 2]);
  });

  it('com um Envido para responder, a desistência conta como recusa antes do Truco', () => {
    const m = game([A, B]);
    act(m, 0, 'envido');
    act(m, 1, 'baralho');
    expect(m.view().history.map((h) => [h.kind, h.team, h.value])).toEqual([['envido', 0, 1], ['truco', 0, 1]]);
  });

  it('na dupla, o parceiro continua; a equipe toda desistindo, acaba a mão', () => {
    const m = game([A, B, ['2-espadas', '4-bastos', '6-ouros'], ['5-copas', '7-bastos', '12-ouros']]);
    act(m, 0, 'baralho');
    let v = m.view().hand!;
    expect(v.ended).toBeNull();
    expect(v.turn).toBe(1);
    act(m, 1, 'jogar', '4-ouros');
    act(m, 2, 'jogar', '2-espadas');
    act(m, 3, 'jogar', '5-copas');
    v = m.view().hand!;
    expect(v.tricks[0]!.plays).toHaveLength(3);
    expect(v.tricks[0]!.outcome).toBe(0);
    expect(m.legalActions(0)).toEqual([]);
    expect(v.turn).toBe(2);
    act(m, 2, 'baralho');
    expect(m.view().hand!.ended).toEqual({ winnerTeam: 1, reason: 'baralho', value: 1 });
    expect(m.view().score).toEqual([0, 1]);
  });
});

/** Joga uma partida inteira; em cada passo, todos que podem agir têm pelo menos uma ação legal. */
function playOut(seats: 2 | 4, seed: number, chooser: 'aleatorio' | 'computador', goal: Goal): SpanishMatch {
  const m = new SpanishMatch(gauderio({ goal, flor: seed % 3 !== 0 }), seats, seed);
  const rnd = seededRandom(seed * 7 + 1);
  m.startHand();
  let entries = 0;
  for (let steps = 0; m.winner === null; steps++) {
    if (steps > 4000) throw new Error(`partida não terminou (semente ${seed})`);
    const actors = m.actors();
    if (m.handOver) {
      // Conferência: às vezes alguém contesta (o computador, só quando viu a Flor); senão, vem a mão seguinte.
      const contester = actors.find((s) => (chooser === 'computador' ? botContests(m, s) : rnd() < 0.3));
      if (contester !== undefined) expect(m.apply(contester, { type: 'contestar' })).toEqual({ ok: true });
      else m.nextHand();
    } else {
      expect(actors.length).toBeGreaterThan(0);
      for (const s of actors) expect(m.legalActions(s).length).toBeGreaterThan(0);
      const seat = actors[Math.floor(rnd() * actors.length)]!;
      const action = chooser === 'computador' ? botAction(m, seat, rnd) : m.legalActions(seat)[Math.floor(rnd() * m.legalActions(seat).length)]!;
      expect(m.apply(seat, action)).toEqual({ ok: true });
    }
    // O placar só muda pelo histórico (a penalidade entra como valor negativo) e nunca fica negativo.
    const v = m.view();
    expect(v.score[0]).toBeGreaterThanOrEqual(0);
    expect(v.score[1]).toBeGreaterThanOrEqual(0);
    for (const e of v.history.slice(entries)) expect(e.score[e.team]).toBeGreaterThanOrEqual(0);
    entries = v.history.length;
  }
  return m;
}

describe('partidas completas simuladas', () => {
  it('ações aleatórias, 2 e 4 jogadores, 12 e 24 tentos: nunca travam e sempre terminam', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const m = playOut(seed % 2 ? 2 : 4, seed, 'aleatorio', seed % 4 < 2 ? 24 : 12);
      expect(Math.max(...m.view().score)).toBeGreaterThanOrEqual(m.config.goal);
      // Cada ponto do placar está no histórico.
      const v = m.view();
      for (const t of [0, 1] as const) expect(v.history.filter((h) => h.team === t).reduce((n, h) => n + h.value, 0)).toBe(v.score[t]);
    }
  });

  it('só o computador jogando, 2 e 4 jogadores', () => {
    for (let seed = 1; seed <= 60; seed++) playOut(seed % 2 ? 2 : 4, seed, 'computador', 24);
  });
});
