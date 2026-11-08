import type { BotSignal, MatchView } from '@trukenza/game-engine';
import type { SignalId } from '@trukenza/shared';

const CLAIMS: Record<SignalId, Pick<BotSignal, 'power' | 'envido' | 'weak'>> = {
  sobrancelhas: { power: 14 }, piscada: { power: 13 }, 'boca-direita': { power: 12 },
  'boca-esquerda': { power: 11 }, labio: { power: 10 }, bico: { power: 9 },
  'boca-aberta': { power: 8 }, cabeca: { envido: 27 }, nariz: { envido: 30 }, olhos: { weak: true },
};

/** Memória transitória do que foi visto na mesa; não lê a mão de ninguém. */
export class SignalMemory {
  private seen = new Map<number, BotSignal>();

  observe(view: MatchView, seat: number, signal: SignalId): void {
    const h = view.hand;
    if (!h || h.ended || view.seats !== 4 || h.folded[seat]) return;
    this.seen.set(seat, {
      seat, hand: h.number,
      played: h.tricks.flatMap(t => t.plays).filter(p => p.seat === seat).length,
      ...CLAIMS[signal],
    });
  }

  forHand(view: MatchView): BotSignal[] {
    for (const [seat, s] of this.seen) {
      if (!view.hand || view.hand.ended || s.hand !== view.hand.number || view.hand.folded[seat]) this.seen.delete(seat);
    }
    return [...this.seen.values()];
  }

  forget(seat: number): void { this.seen.delete(seat); }
  clear(): void { this.seen.clear(); }
}
