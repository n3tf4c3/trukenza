import { describe, expect, it } from 'vitest';
import type { MatchEvent } from '@trukenza/game-engine';
import { PHRASE_IDS } from '@trukenza/shared';
import { botBanter } from '../src/botBanter.ts';

const always = () => 0;
const never = () => 0.999;

describe('conversa do computador', () => {
  it('só fala por computador, com frase do catálogo e depois do lance', () => {
    const events: MatchEvent[] = [
      { id: 1, kind: 'canto', seat: 1, call: 'truco' },
      { id: 2, kind: 'resposta', seat: 0, answer: 'nao-quero', about: 'truco' },
      { id: 3, kind: 'vaza', trick: 0, outcome: 1, winnerSeat: 1 },
      { id: 4, kind: 'fim-mao', winnerTeam: 1, reason: 'vazas', value: 3 },
      { id: 5, kind: 'nova-mao', hand: 2, dealer: 0, mano: 1 },
      { id: 6, kind: 'fim-partida', winner: 0 },
    ];
    for (const event of events) {
      const said = botBanter(event, 4, [1, 3], always);
      expect(said, event.kind).not.toBeNull();
      expect([1, 3]).toContain(said!.seat);
      expect(PHRASE_IDS).toContain(said!.phrase);
      expect(said!.delayMs).toBeGreaterThanOrEqual(1200);
      expect(botBanter(event, 4, [1, 3], never), event.kind).toBeNull();
      expect(botBanter(event, 4, [], always), event.kind).toBeNull();
    }
  });
  it('provoca só no próprio Truco e responde à recusa do adversário', () => {
    expect(botBanter({ id: 1, kind: 'canto', seat: 0, call: 'truco' }, 2, [1], always)).toBeNull();
    expect(botBanter({ id: 1, kind: 'canto', seat: 1, call: 'envido' }, 2, [1], always)).toBeNull();
    expect(botBanter({ id: 1, kind: 'canto', seat: 1, call: 'truco' }, 2, [1], always)).toEqual({ seat: 1, phrase: 'medo', delayMs: 1700 });
    // Recusa do próprio parceiro não vira provocação.
    expect(botBanter({ id: 2, kind: 'resposta', seat: 3, answer: 'nao-quero', about: 'truco' }, 4, [1], always)).toBeNull();
    expect(botBanter({ id: 2, kind: 'resposta', seat: 0, answer: 'quero', about: 'truco' }, 2, [1], always)).toBeNull();
  });
  it('não comenta a primeira mão nem a vaza no mano a mano', () => {
    expect(botBanter({ id: 1, kind: 'nova-mao', hand: 1, dealer: 0, mano: 1 }, 2, [1], always)).toBeNull();
    expect(botBanter({ id: 1, kind: 'vaza', trick: 0, outcome: 1, winnerSeat: 1 }, 2, [1], always)).toBeNull();
    expect(botBanter({ id: 1, kind: 'carta', seat: 1, card: '1-espadas', trick: 0 }, 2, [1], always)).toBeNull();
  });
});
