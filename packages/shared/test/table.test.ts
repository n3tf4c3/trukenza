import { describe, expect, it } from 'vitest';
import {
  PHASE_PLAYING,
  PHASE_WAITING,
  SEAT_AWAY,
  SEAT_FREE,
  SEAT_RESERVED,
  SEAT_TAKEN,
  BOT_PREFIX,
  Table,
  teamOf,
} from '../src/index.ts';

/** Mesa com todos sentados, chegados e prontos. */
function fullTable(seats: 2 | 4): Table {
  const t = new Table(seats);
  for (let i = 0; i < seats; i++) {
    t.join(`p${i}`, `P${i}`);
    expect(t.sit(`p${i}`, i)).toBe('ok');
    t.settle(`p${i}`, i);
    expect(t.setReady(`p${i}`, true)).toBe('ok');
  }
  return t;
}

describe('cadeiras', () => {
  it('passam de livre a reservada, ocupada e desconectada', () => {
    const t = new Table(2);
    t.join('a', 'Ana');
    expect(t.seatStatus(0)).toBe(SEAT_FREE);
    t.sit('a', 0);
    expect(t.seatStatus(0)).toBe(SEAT_RESERVED);
    t.settle('a', 0);
    expect(t.seatStatus(0)).toBe(SEAT_TAKEN);
    t.setConnected('a', false);
    expect(t.seatStatus(0)).toBe(SEAT_AWAY);
    t.setConnected('a', true);
    expect(t.seatStatus(0)).toBe(SEAT_TAKEN);
  });

  it('só um jogador fica com a cadeira disputada', () => {
    const t = new Table(4);
    t.join('a', 'Ana');
    t.join('b', 'Bia');
    expect(t.sit('a', 2)).toBe('ok');
    expect(t.sit('b', 2)).toBe('cadeira-ocupada');
    expect(t.occupant(2)?.id).toBe('a');
    expect(t.players.get('b')!.seat).toBe(-1);
  });

  it('cadeira reservada também não pode ser tomada', () => {
    const t = new Table(2);
    t.join('a', 'Ana');
    t.join('b', 'Bia');
    t.sit('a', 1);
    expect(t.seatStatus(1)).toBe(SEAT_RESERVED);
    expect(t.sit('b', 1)).toBe('cadeira-ocupada');
  });

  it('a cadeira de quem caiu fica guardada', () => {
    const t = new Table(2);
    t.join('a', 'Ana');
    t.join('b', 'Bia');
    t.sit('a', 0);
    t.setConnected('a', false);
    expect(t.sit('b', 0)).toBe('cadeira-ocupada');
  });

  it('recusa cadeira fora da mesa', () => {
    const t = new Table(2);
    t.join('a', 'Ana');
    for (const seat of [-1, 2, 3, 0.5, Number.NaN]) expect(t.sit('a', seat)).toBe('cadeira-invalida');
  });

  it('trocar de cadeira libera a anterior e zera o pronto', () => {
    const t = new Table(4);
    t.join('a', 'Ana');
    t.sit('a', 0);
    t.settle('a', 0);
    t.setReady('a', true);
    expect(t.sit('a', 3)).toBe('ok');
    expect(t.seatStatus(0)).toBe(SEAT_FREE);
    expect(t.seatStatus(3)).toBe(SEAT_RESERVED);
    expect(t.players.get('a')!.ready).toBe(false);
  });

  it('chegada atrasada da cadeira antiga não ocupa a nova', () => {
    const t = new Table(4);
    t.join('a', 'Ana');
    t.sit('a', 0);
    t.sit('a', 1);
    t.settle('a', 0);
    expect(t.seatStatus(1)).toBe(SEAT_RESERVED);
  });

  it('levantar e sair liberam a cadeira', () => {
    const t = new Table(2);
    t.join('a', 'Ana');
    t.join('b', 'Bia');
    t.sit('a', 0);
    expect(t.stand('a')).toBe('ok');
    expect(t.seatStatus(0)).toBe(SEAT_FREE);
    expect(t.stand('a')).toBe('nao-sentado');
    t.sit('b', 1);
    t.leave('b');
    expect(t.seatStatus(1)).toBe(SEAT_FREE);
  });

  it('cadeira e personagem são escolhas independentes', () => {
    const t = new Table(4);
    t.join('a', 'Ana', 'moleti');
    t.join('b', 'Bia', 'moleti');
    // O mesmo personagem em duas cadeiras quaisquer.
    expect(t.sit('a', 3)).toBe('ok');
    expect(t.sit('b', 0)).toBe('ok');
    t.settle('a', 3);
    t.setReady('a', true);
    // Trocar de personagem sentado não tira da cadeira nem do pronto.
    expect(t.setCharacter('a', 'baiaca')).toBe('ok');
    expect(t.players.get('a')).toMatchObject({ seat: 3, settled: true, ready: true, character: 'baiaca' });
    expect(t.seatStatus(3)).toBe(SEAT_TAKEN);
  });

  it('parceiros da mesa de 4 ficam frente a frente', () => {
    expect([0, 1, 2, 3].map(teamOf)).toEqual([0, 1, 0, 1]);
  });
});

describe('pronto e começo', () => {
  it('só fica pronto quem já chegou à cadeira', () => {
    const t = new Table(2);
    t.join('a', 'Ana');
    expect(t.setReady('a', true)).toBe('nao-sentado');
    t.sit('a', 0);
    expect(t.setReady('a', true)).toBe('nao-chegou');
    t.settle('a', 0);
    expect(t.setReady('a', true)).toBe('ok');
  });

  it('o anfitrião começa com a mesa completa e todos prontos', () => {
    for (const seats of [2, 4] as const) {
      const t = fullTable(seats);
      expect(t.start('p1')).toBe('so-anfitriao');
      expect(t.start('p0')).toBe('ok');
      expect(t.phase).toBe(PHASE_PLAYING);
      expect(t.seatedIds()).toEqual(Array.from({ length: seats }, (_, i) => `p${i}`));
    }
  });

  it('não começa com cadeira vazia, reservada, de quem caiu ou alguém não pronto', () => {
    const t = new Table(2);
    t.join('a', 'Ana');
    t.sit('a', 0);
    t.settle('a', 0);
    t.setReady('a', true);
    expect(t.start('a')).toBe('mesa-incompleta');
    t.join('b', 'Bia');
    t.sit('b', 1);
    expect(t.start('a')).toBe('mesa-incompleta');
    t.settle('b', 1);
    expect(t.start('a')).toBe('faltam-prontos');
    t.setReady('b', true);
    t.setConnected('b', false);
    expect(t.start('a')).toBe('mesa-incompleta');
    t.setConnected('b', true);
    expect(t.start('a')).toBe('ok');
  });

  it('durante a partida ninguém troca de cadeira nem de personagem', () => {
    const t = fullTable(2);
    t.start('p0');
    expect(t.sit('p0', 1)).toBe('partida-em-andamento');
    expect(t.stand('p0')).toBe('partida-em-andamento');
    expect(t.setCharacter('p0', 'moleti')).toBe('partida-em-andamento');
  });

  it('quem sai no meio da partida é substituído pelo computador na mesma cadeira; o anfitrião passa ao seguinte', () => {
    const t = fullTable(4);
    t.start('p0');
    const bot = t.leave('p0');
    expect(t.phase).toBe(PHASE_PLAYING);
    expect(bot).toMatchObject({ bot: true, seat: 0, settled: true, ready: true });
    expect(t.occupant(0)?.id).toBe(bot!.id);
    expect(t.hostId).toBe('p1');
    // Na espera, sair só libera a cadeira.
    const w = fullTable(2);
    expect(w.leave('p1')).toBeNull();
    expect(w.seatStatus(1)).toBe(SEAT_FREE);
  });

  it('regras: só o anfitrião muda, e só na espera', () => {
    const t = fullTable(2);
    expect(t.rules).toEqual({ goal: 24, flor: true, turnSeconds: 30 });
    const twelve = { goal: 12 as const, flor: false, turnSeconds: 15 };
    expect(t.setRules('p1', twelve)).toBe('so-anfitriao');
    expect(t.setRules('p0', twelve)).toBe('ok');
    expect(t.rules).toEqual(twelve);
    t.start('p0');
    expect(t.setRules('p0', { goal: 24, flor: true, turnSeconds: 30 })).toBe('partida-em-andamento');
    expect(t.rules).toEqual(twelve);
  });

  it('encerrar volta à espera e zera os prontos', () => {
    const t = fullTable(2);
    expect(t.end('p0')).toBe('sem-partida');
    t.start('p0');
    expect(t.end('p1')).toBe('so-anfitriao');
    expect(t.end('p0')).toBe('ok');
    expect(t.phase).toBe(PHASE_WAITING);
    expect(t.players.get('p1')!.ready).toBe(false);
  });
});

describe('computador', () => {
  it('o anfitrião completa as cadeiras livres; o computador chega pronto e com personagens variados', () => {
    const t = new Table(4);
    t.join('a', 'Ana', 'moleti');
    t.sit('a', 1);
    t.join('b', 'Bia');
    expect(t.addBots('b').result).toBe('so-anfitriao');
    const { result, added } = t.addBots('a');
    expect(result).toBe('ok');
    expect(added.map((b) => b.seat)).toEqual([0, 2, 3]);
    expect(added.every((b) => b.bot && b.ready && b.id.startsWith(BOT_PREFIX))).toBe(true);
    // Primeiro os personagens que ninguém usa; depois, o uso mais equilibrado possível.
    expect(added.slice(0, 2).map((b) => b.character).sort()).toEqual(['baiaca', 'neymt']);
    const uses = [...t.players.values()].reduce((m, p) => m.set(p.character, (m.get(p.character) ?? 0) + 1), new Map<string, number>());
    expect(Math.max(...uses.values()) - Math.min(...uses.values())).toBeLessThanOrEqual(1);
    expect(t.addBots('a').result).toBe('sem-cadeira-livre');
    // O computador não conta como pessoa nem vira anfitrião.
    expect(t.humans().map((p) => p.id)).toEqual(['a', 'b']);
    t.leave('a');
    expect(t.hostId).toBe('b');
  });

  it('deixa a cadeira pedida para o anfitrião', () => {
    const t = new Table(2);
    t.join('a', 'Ana');
    expect(t.addBots('a', 0).added.map((b) => b.seat)).toEqual([1]);
    expect(t.seatStatus(0)).toBe(SEAT_FREE);
  });

  it('cede a cadeira a quem chega, mas não toma a de ninguém', () => {
    const t = new Table(2);
    t.join('a', 'Ana');
    t.sit('a', 0);
    const [bot] = t.addBots('a').added;
    t.join('b', 'Bia');
    expect(t.sit('b', 1)).toBe('ok');
    expect(t.players.has(bot!.id)).toBe(false);
    expect(t.occupant(1)?.id).toBe('b');
    // Pessoa não perde cadeira para outra pessoa, com ou sem computador na mesa.
    t.join('c', 'Caio');
    expect(t.sit('c', 1)).toBe('cadeira-ocupada');
  });

  it('com o computador a mesa começa; ao voltar à espera ele continua pronto', () => {
    const t = new Table(4);
    t.join('a', 'Ana');
    t.sit('a', 0);
    t.settle('a', 0);
    t.setReady('a', true);
    const { added } = t.addBots('a');
    expect(t.start('a')).toBe('mesa-incompleta');
    for (const b of added) t.settle(b.id, b.seat);
    expect(t.start('a')).toBe('ok');
    expect(t.seatedIds()).toHaveLength(4);
    expect(t.addBots('a').result).toBe('partida-em-andamento');
    expect(t.removeBot('a', 1)).toBe('partida-em-andamento');
    t.end('a');
    expect(added.every((b) => t.players.get(b.id)!.ready)).toBe(true);
    expect(t.players.get('a')!.ready).toBe(false);
  });

  it('o anfitrião tira o computador; cadeira de pessoa não', () => {
    const t = new Table(2);
    t.join('a', 'Ana');
    t.sit('a', 0);
    t.addBots('a');
    t.join('b', 'Bia');
    expect(t.removeBot('b', 1)).toBe('so-anfitriao');
    expect(t.removeBot('a', 0)).toBe('nao-e-computador');
    expect(t.removeBot('a', 1)).toBe('ok');
    expect(t.seatStatus(1)).toBe(SEAT_FREE);
  });
});
