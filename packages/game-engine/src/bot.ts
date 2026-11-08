import { parseCardId, trucoPower, type Card } from './cards.ts';
import { envidoPoints } from './envido.ts';
import { florPoints, hasFlor } from './flor.ts';
import { TRUCO_CALLS, type Action, type ActionType, type MatchView, type SpanishMatch } from './match.ts';
import { handWinner, resolveTrick, teamOf, type Team } from './tricks.ts';

export type BotDifficulty = 'tranquilo' | 'equilibrado' | 'competitivo';

/** Informação alegada num gesto público, nunca uma carta confirmada pelo servidor. */
export interface BotSignal {
  seat: number;
  hand: number;
  /** Quantas cartas o autor já tinha jogado quando sinalizou. */
  played: number;
  power?: number;
  envido?: number;
  weak?: boolean;
}

export function partnerSignal(view: MatchView, seat: number, signals: readonly BotSignal[]): BotSignal | undefined {
  const h = view.hand;
  if (view.seats !== 4 || !h || h.ended) return;
  const partner = (seat + 2) % 4;
  if (h.folded[partner]) return;
  const hint = signals.find(s => s.seat === partner && s.hand === h.number);
  if (!hint) return;
  const played = h.tricks.flatMap(t => t.plays).filter(p => p.seat === partner).length;
  // Envido usa as três cartas originais. Sinais de força expiram na próxima carta do autor.
  return hint.envido !== undefined || hint.played === played ? hint : undefined;
}

/**
 * Jogador do computador. Decide só com o que um jogador de verdade sabe: as próprias cartas e o que está
 * na mesa (a visão pública). Escolhe sempre entre as ações legais do motor, então nunca trava a mesa.
 * Também joga por quem caiu ou deixou o tempo acabar.
 */
export function botAction(match: SpanishMatch, seat: number, random: () => number, signals: readonly BotSignal[] = [], difficulty: BotDifficulty = 'equilibrado'): Action {
  const legal = match.legalActions(seat);
  if (legal.length === 0) throw new Error(`nenhuma ação legal para a cadeira ${seat}`);
  const find = (type: ActionType) => legal.find((a) => a.type === type);
  const pick = (...types: ActionType[]) => types.map(find).find((a) => a !== undefined);
  const view = match.view();
  const hand = view.hand!;
  const team = teamOf(seat);
  const dealt = match.dealtOf(seat);
  const cards = match.handOf(seat);
  const hint = partnerSignal(view, seat, signals);
  const calm = difficulty === 'tranquilo';
  const competitive = difficulty === 'competitivo';

  // Na conferência, contestar é a única ação (a sala só pede quando `botContests` diz que vale).
  if (hand.decision === 'conferencia') return find('contestar')!;

  // O computador não esconde a Flor.
  const flor = find('flor');
  if (flor) return flor;

  // Disputa de Flor: quanto melhor a Flor, mais aposta.
  if (hand.decision === 'flor') {
    const points = florPoints(dealt);
    if (!calm && points >= 36 && random() < 0.5) return pick('contra-flor', 'contra-flor-resto', 'quero')!;
    return points >= 29 ? find('quero')! : find('me-achico')!;
  }

  const envido = Math.max(envidoPoints(dealt), hint?.envido ?? 0);
  if (hand.decision === 'envido') {
    if (!calm && envido >= 31 && random() < 0.45) return pick('real-envido', 'falta-envido', 'envido', 'quero')!;
    if (envido >= 27 || (envido >= 24 && random() < 0.35)) return find('quero')!;
    return find('nao-quero')!;
  }

  const ownStrength = handStrength(competitive ? [...cards].sort((a, b) => trucoPower(b) - trucoPower(a)).slice(0, 2) : cards, view, team);
  const strength = Math.min(1, Math.max(0, ownStrength + (hint?.power ? hint.power / 14 * 0.32 : hint?.weak ? -0.12 : 0)));
  if (hand.decision === 'truco') {
    // Com Envido bom, canta primeiro (o Truco espera).
    if (!calm && envido >= 28 && find('envido')) return envido >= 31 && find('real-envido') ? find('real-envido')! : find('envido')!;
    // Truco antes do Envido: sem Envido bom para cantar, contesta (o Truco continua esperando a resposta).
    const contest = find('contestar');
    if (contest) return contest;
    const raise = legal.find((a) => (TRUCO_CALLS as readonly string[]).includes(a.type));
    if (!calm && raise && strength >= 0.78 && random() < 0.6) return raise;
    if (strength >= 0.45 || random() < 0.12) return find('quero')!;
    return find('nao-quero')!;
  }

  // Na própria vez.
  if (find('envido') && envido >= (calm ? 31 : 27) && random() < (calm ? 0.3 : 0.75)) return !calm && envido >= 31 && find('real-envido') ? find('real-envido')! : find('envido')!;
  const call = legal.find((a) => (TRUCO_CALLS as readonly string[]).includes(a.type) && !(a.type === 'truco' && match.trucoBeforeEnvido(seat)));
  if (call && (strength >= (calm ? 0.85 : 0.72) ? random() < (calm ? 0.2 : 0.55) : !calm && random() < 0.04)) return call;
  const plays = legal.filter(a => a.type === 'jogar');
  if (calm && plays.length && random() < 0.5) return plays[Math.min(plays.length - 1, Math.floor(random() * plays.length))]!;
  return chooseCard(legal, view, team, seat, hint, competitive);
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
function chooseCard(legal: Action[], view: MatchView, team: Team, seat: number, hint?: BotSignal, competitive = false): Action {
  const plays = legal.filter((a) => a.type === 'jogar').sort((a, b) => trucoPower(a.card!) - trucoPower(b.card!));
  if (plays.length === 0) return legal[0]!;
  const hand = view.hand!;
  const trick = hand.tricks[hand.tricks.length - 1]!;
  // Último a jogar: procura a carta mais barata que fecha a mão, inclusive por parda.
  // Só simula cartas próprias contra jogadas já públicas.
  const remaining = hand.folded.filter((folded, s) => !folded && !trick.plays.some(p => p.seat === s)).length;
  if (competitive && remaining === 1) {
    const previous = hand.tricks.slice(0, -1).flatMap(t => t.outcome === null ? [] : [t.outcome]);
    const closing = plays.find(a => {
      const result = resolveTrick([...trick.plays.map(p => ({ seat: p.seat, card: parseCardId(p.card)! })), { seat, card: a.card! }]);
      return handWinner([...previous, result.outcome], teamOf(hand.mano)) === team;
    });
    if (closing) return closing;
  }
  const partner = (seat + 2) % 4;
  const partnerStillPlays = view.seats === 4 && !hand.folded[partner] && !trick.plays.some(p => p.seat === partner);
  if (trick.plays.length === 0) {
    if (partnerStillPlays && (hint?.power ?? 0) >= 11) return plays[0]!;
    return hand.tricks.length === 1 ? plays[Math.floor((plays.length - 1) / 2)]! : plays[plays.length - 1]!;
  }
  const power = (id: string) => trucoPower(parseCardId(id)!);
  const mine = Math.max(0, ...trick.plays.filter((p) => teamOf(p.seat) === team).map((p) => power(p.card)));
  const theirs = Math.max(0, ...trick.plays.filter((p) => teamOf(p.seat) !== team).map((p) => power(p.card)));
  if (mine > theirs) return plays[0]!;
  // Guarda força se o parceiro ainda vai jogar e diz que pode cobrir a mesa. Pode ser blefe.
  if (partnerStillPlays && (hint?.power ?? 0) > theirs) return plays[0]!;
  const winning = plays.find((a) => trucoPower(a.card!) > theirs);
  if (competitive && !winning && remaining === 1) {
    const equal = plays.find(a => trucoPower(a.card!) === theirs);
    const previous = hand.tricks.slice(0, -1).flatMap(t => t.outcome === null ? [] : [t.outcome]);
    // Se não pode ganhar, empata em vez de entregar a vaza, desde que a parda não dê a mão ao rival.
    if (equal && handWinner([...previous, 'parda'], teamOf(hand.mano)) !== (1 - team)) return equal;
  }
  return winning ?? plays[0]!;
}
