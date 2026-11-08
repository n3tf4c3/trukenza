import { describe, expect, it } from 'vitest';
import { SCENERY_IDS, parseScenery, parseSceneryMessage, Table } from '../src/index.ts';

describe('cenários da mesa', () => {
  it('aceita só os destinos conhecidos, incluindo mensagens antigas sem cenário', () => {
    for (const scenery of SCENERY_IDS) expect(parseSceneryMessage({ scenery })).toBe(scenery);
    for (const raw of ['constructor', '__proto__', 'outro', null, 1, {}]) expect(parseScenery(raw)).toBeNull();
    expect(parseSceneryMessage({})).toBeNull();
    expect(new Table(2).scenery).toBe('bolicho');
  });

  it('só o anfitrião muda na espera, preserva pronto e mantém o cenário na partida', () => {
    const table = new Table(2);
    for (const [i, id] of ['a', 'b'].entries()) {
      table.join(id, id); table.sit(id, i); table.settle(id, i); table.setReady(id, true);
    }
    expect(table.setScenery('intruso', 'vegas')).toBe('desconhecido');
    expect(table.setScenery('b', 'vegas')).toBe('so-anfitriao');
    expect(table.setScenery('a', 'fuji')).toBe('ok');
    expect(table.players.get('a')?.ready).toBe(true);
    table.start('a');
    expect(table.setScenery('a', 'paris')).toBe('partida-em-andamento');
    expect(table.scenery).toBe('fuji');
    table.end('a');
    table.leave('a');
    expect(table.setScenery('b', 'cataratas')).toBe('ok');
  });
});
