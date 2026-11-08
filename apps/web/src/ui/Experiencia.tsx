import { useEffect } from 'react';
import { cardId, RANK_NAMES, SUIT_NAMES, type Card } from '@trukenza/game-engine';
import { PHASE_WAITING } from '@trukenza/shared';
import { cardShortcut, handExplanation, TIPS, validSelection, type TipId } from '../handExperience';
import { playSelectedCard, selectCard } from '../net';
import { selectMe, useStore, type TableView } from '../store';
import { teamName, type GameView } from '../game';

const cardName = (card: Card) => `${RANK_NAMES[card.rank]} de ${SUIT_NAMES[card.suit]}`;

export function ControlesCartas() {
  const { hand, playable, selectedCard, handVersion, reconnecting, game } = useStore();
  const selected = validSelection(selectedCard, handVersion, playable);
  const card = hand.find(c => cardId(c) === selected);
  const active = !!game?.hand && !game.hand.ended && game.winner === null && playable.length > 0 && !reconnecting;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const selecting = !!target?.closest('.selecao-cartas button');
      const blocked = !!document.querySelector('dialog[open]') || (!selecting && !!target?.closest('input, textarea, select, button, summary, a, [contenteditable]:not([contenteditable="false"])'));
      const shortcut = cardShortcut(e.key, blocked, e.repeat, e.ctrlKey || e.metaKey || e.altKey || e.shiftKey);
      if (shortcut === null) return;
      e.preventDefault();
      if (shortcut === 'play') playSelectedCard();
      else if (shortcut === 'clear') useStore.setState({ selectedCard: null });
      else if (hand[shortcut]) selectCard(hand[shortcut]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, hand]);
  if (!active) return null;
  return <section className="controles-cartas" aria-label="Jogar uma carta">
    <div className="selecao-cartas" role="group" aria-label="Selecionar carta">
      {hand.map((c, i) => <button key={cardId(c)} type="button" aria-pressed={selected === cardId(c)}
        disabled={!playable.includes(cardId(c))} onClick={() => selectCard(c)} aria-label={`Carta ${i + 1}: ${cardName(c)}`}>
        <kbd>{i + 1}</kbd> {RANK_NAMES[c.rank]} <small>{SUIT_NAMES[c.suit]}</small>
      </button>)}
    </div>
    <button type="button" className="principal confirmar-carta" disabled={!card} onClick={playSelectedCard}>
      {card ? `Jogar ${cardName(card)}` : 'Selecione uma carta'}
    </button>
    <small className="atalhos-cartas">1–3 seleciona · Enter joga · Esc cancela</small>
  </section>;
}

export function ResumoMao({ game, table }: { game: GameView; table: TableView }) {
  const s = game.lastHandSummary;
  if (!s) return null;
  const name = (team: 0 | 1) => teamName(team, game.seats, seat => table.players.find(p => p.seat === seat)?.name ?? `Cadeira ${seat + 1}`);
  const current = !!game.hand?.ended && game.hand.number === s.number;
  return <details className="resumo-mao" key={`${s.number}:${current}`} open={current ? true : undefined}>
    <summary>Resumo da mão {s.number}{!current && ' · ver pontos'}</summary>
    <strong>{s.ended.winnerTeam === null ? 'Partida decidida pelo canto' : `${name(s.ended.winnerTeam)} ganhou a mão`}</strong>
    <p>{handExplanation(s)}</p>
    <ul>{s.entries.map((e, i) => <li key={i}>{e.detail}: {e.value >= 0 ? '+' : '−'}{Math.abs(e.value)} · {name(e.team)}</li>)}</ul>
    <small>Saldo da mão: {([0, 1] as const).map(t => `${name(t)} ${s.points[t] >= 0 ? '+' : ''}${s.points[t]}`).join(' · ')}</small>
  </details>;
}

export function DicasContextuais() {
  const { tipsOn, seenTips, dismissTip, table, game, actions, reconnecting } = useStore();
  const me = useStore(selectMe);
  if (!tipsOn || !table || reconnecting || game?.winner != null) return null;
  const candidates: TipId[] = table.phase === PHASE_WAITING ? ['cadeira']
    : game?.hand?.ended ? ['resumo'] : actions.includes('quero') ? ['resposta']
    : actions.includes('jogar') ? ['cartas'] : table.seatCount === 4 && (me?.seat ?? -1) >= 0 ? ['sinais'] : [];
  const tip = candidates.find(id => !seenTips.includes(id));
  if (!tip) return null;
  return <aside className="dica-contextual" aria-label="Dica de jogo">
    <p><strong>Dica</strong> · {TIPS[tip]}</p>
    <button type="button" onClick={() => dismissTip(tip)}>Entendi</button>
  </aside>;
}

export function OpcoesDicas() {
  const { tipsOn, setTipsOn, resetTips } = useStore();
  return <div className="grupo" role="group" aria-label="Dicas de jogo">
    <button type="button" aria-pressed={tipsOn} onClick={() => setTipsOn(!tipsOn)}>Dicas: {tipsOn ? 'ligadas' : 'desligadas'}</button>
    <button type="button" onClick={resetTips}>Rever dicas</button>
  </div>;
}
