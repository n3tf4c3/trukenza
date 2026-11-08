import type { MatchEvent } from '@trukenza/game-engine';
import type { PhraseId } from '@trukenza/shared';

export interface Banter { seat: number; phrase: PhraseId; delayMs: number }

/** Intervalo mínimo entre comentários do computador na mesma sala: tempero, não falatório. */
export const BANTER_GAP_MS = 9000;

/**
 * Comentário do computador sobre um acontecimento público, com as frases rápidas dos jogadores.
 * Decide só pelo evento e pelo acaso: nunca pelas cartas na mão. Assim a fala não denuncia nada que
 * o próprio lance já não tenha mostrado (o computador provoca depois de um Truco forte ou fraco igual).
 */
export function botBanter(event: MatchEvent, seats: number, bots: readonly number[], random: () => number): Banter | null {
  if (!bots.length) return null;
  const team = (seat: number) => seat % 2;
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const botOf = (t: number) => {
    const options = bots.filter(s => team(s) === t);
    return options.length ? pick(options) : null;
  };
  const chance = (p: number) => random() < p;
  switch (event.kind) {
    case 'canto':
      if (bots.includes(event.seat) && ['truco', 'retruco', 'vale-quatro'].includes(event.call) && chance(0.22)) {
        return { seat: event.seat, phrase: 'medo', delayMs: 1700 };
      }
      return null;
    case 'resposta': {
      if (event.answer !== 'nao-quero' || event.about !== 'truco') return null;
      const bot = botOf(1 - team(event.seat));
      return bot !== null && chance(0.3) ? { seat: bot, phrase: 'chora', delayMs: 1400 } : null;
    }
    case 'vaza': {
      // Em duplas, o computador comemora a vaza do parceiro.
      const w = event.winnerSeat;
      if (seats !== 4 || w === null) return null;
      const partner = (w + 2) % 4;
      return bots.includes(partner) && chance(0.12) ? { seat: partner, phrase: 'boa', delayMs: 1300 } : null;
    }
    case 'fim-mao': {
      if (event.winnerTeam === null || event.value < 2 || !chance(0.4)) return null;
      const bot = pick(bots);
      const losing = team(bot) !== event.winnerTeam;
      return { seat: bot, phrase: losing ? 'sorte' : seats === 4 ? 'bah' : 'chora', delayMs: 1600 };
    }
    case 'nova-mao':
      return event.hand > 1 && chance(0.12) ? { seat: pick(bots), phrase: pick(['saude', 'gelada', 'farofa'] as const), delayMs: 1500 } : null;
    case 'fim-partida': {
      const bot = botOf(1 - event.winner);
      return bot !== null && chance(0.6) ? { seat: bot, phrase: 'mais-uma', delayMs: 2600 } : null;
    }
    default:
      return null;
  }
}
