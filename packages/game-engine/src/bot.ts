import { parseCardId, trucoPower, type Card } from './cards.ts';
import { envidoPoints } from './envido.ts';
import { florPoints, hasFlor } from './flor.ts';
import { TRUCO_CALLS, type Action, type ActionType, type MatchView, type SpanishMatch } from './match.ts';
import { teamOf, type Team } from './tricks.ts';

/**
 * Jogador do computador. Decide só com o que um jogador de verdade sabe: as próprias cartas e o que está
 * na mesa (a visão pública). Escolhe sempre entre as ações legais do motor, então nunca trava a mesa.
 * Também joga por quem caiu ou deixou o tempo acabar.
 */
export function botAction(match: SpanishMatch, seat: number, random: () => number): Action {
  const legal = match.legalActions(seat);
  if (legal.length === 0) throw new Error(`nenhuma ação legal para a cadeira ${seat}`);
  const find = (type: ActionType) => legal.find((a) => a.type === type);
  const pick = (...types: ActionType[]) => types.map(find).find((a) => a !== undefined);
  const view = match.view();
  const hand = view.hand!;
  const team = teamOf(seat);
  const dealt = match.dealtOf(seat);
  const cards = match.handOf(seat);

  // Na conferência, contestar é a única ação (a sala só pede quando `botContests` diz que vale).
  if (hand.decision === 'conferencia') return find('contestar')!;

  // O computador não esconde a Flor.
  const flor = find('flor');
  if (flor) return flor;

  // Disputa de Flor: quanto melhor a Flor, mais aposta.
  if (hand.decision === 'flor') {
    const points = florPoints(dealt);
    if (points >= 36 && random() < 0.5) return pick('contra-flor', 'contra-flor-resto', 'quero')!;
    return points >= 29 ? find('quero')! : find('me-achico')!;
  }

  const envido = envidoPoints(dealt);
  if (hand.decision === 'envido') {
    if (envido >= 31 && random() < 0.45) return pick('real-envido', 'falta-envido', 'envido', 'quero')!;
    if (envido >= 27 || (envido >= 24 && random() < 0.35)) return find('quero')!;
    return find('nao-quero')!;
  }

  const strength = handStrength(cards, view, team);
  if (hand.decision === 'truco') {
    // Com Envido bom, canta primeiro (o Truco espera).
    if (envido >= 28 && find('envido')) return envido >= 31 && find('real-envido') ? find('real-envido')! : find('envido')!;
    // Truco antes do Envido: sem Envido bom para cantar, contesta (o Truco continua esperando a resposta).
    const contest = find('contestar');
    if (contest) return contest;
    const raise = legal.find((a) => (TRUCO_CALLS as readonly string[]).includes(a.type));
    if (raise && strength >= 0.78 && random() < 0.6) return raise;
    if (strength >= 0.45 || random() < 0.12) return find('quero')!;
    return find('nao-quero')!;
  }

  // Na própria vez.
  if (find('envido') && envido >= 27 && random() < 0.75) return envido >= 31 && find('real-envido') ? find('real-envido')! : find('envido')!;
  const call = legal.find((a) => (TRUCO_CALLS as readonly string[]).includes(a.type) && !(a.type === 'truco' && match.trucoBeforeEnvido(seat)));
  if (call && (strength >= 0.72 ? random() < 0.55 : random() < 0.04)) return call;
  return chooseCard(legal, view, team);
}

/**
 * Na conferência do fim da mão: o computador contesta se viu uma Flor não anunciada entre as cartas da equipe
 * que levou o Envido (as mostradas no fim ou as três jogadas). Só olha a visão pública.
 */
export function botContests(match: SpanishMatch, seat: number): boolean {
  const view = match.view();
  const hand = view.hand;
  if (!hand?.review || !match.legalActions(seat).some((a) => a.type === 'contestar')) return false;
  const offender = hand.envido.result?.winnerTeam;
  for (let s = 0; s < view.seats; s++) {
    if (teamOf(s) !== offender || hand.flor.announced.includes(s)) continue;
    const shown = hand.review.shown.find((x) => x.seat === s)?.cards;
    const played = hand.tricks.flatMap((t) => t.plays.filter((p) => p.seat === s).map((p) => p.card));
    const seen = (shown ?? (played.length === 3 ? played : [])).map((id) => parseCardId(id)!);
    if (hasFlor(seen)) return true;
  }
  return false;
}

/** De 0 a 1: força das cartas que restam, com o peso das vazas já ganhas ou perdidas pela equipe. */
function handStrength(cards: Card[], view: MatchView, team: Team): number {
  const hand = view.hand!;
  if (cards.length === 0) return 0.5;
  const power = cards.reduce((n, c) => n + trucoPower(c), 0) / (cards.length * 14);
  const won = hand.tricks.filter((t) => t.outcome === team).length;
  const lost = hand.tricks.filter((t) => t.outcome !== null && t.outcome !== 'parda' && t.outcome !== team).length;
  return Math.max(0, Math.min(1, power + 0.3 * won - 0.3 * lost));
}

/**
 * Qual carta jogar: abrindo, uma do meio na primeira vaza e a mais forte depois; se o parceiro já está
 * ganhando, a mais fraca; senão, a mais fraca que ainda ganha, ou a mais fraca de todas.
 */
function chooseCard(legal: Action[], view: MatchView, team: Team): Action {
  const plays = legal.filter((a) => a.type === 'jogar').sort((a, b) => trucoPower(a.card!) - trucoPower(b.card!));
  if (plays.length === 0) return legal[0]!;
  const hand = view.hand!;
  const trick = hand.tricks[hand.tricks.length - 1]!;
  if (trick.plays.length === 0) {
    return hand.tricks.length === 1 ? plays[Math.floor((plays.length - 1) / 2)]! : plays[plays.length - 1]!;
  }
  const power = (id: string) => trucoPower(parseCardId(id)!);
  const mine = Math.max(0, ...trick.plays.filter((p) => teamOf(p.seat) === team).map((p) => power(p.card)));
  const theirs = Math.max(0, ...trick.plays.filter((p) => teamOf(p.seat) !== team).map((p) => power(p.card)));
  if (mine > theirs) return plays[0]!;
  const winning = plays.find((a) => trucoPower(a.card!) > theirs);
  return winning ?? plays[0]!;
}
