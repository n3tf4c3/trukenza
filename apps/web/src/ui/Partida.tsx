import { useEffect, useRef, useState } from 'react';
import { RANK_NAMES, SUIT_NAMES, parseCardId, trucoPower, type Team } from '@trukenza/game-engine';
import { cardImage } from '../cardArt';
import { endMatch, rematch, sendAction } from '../net';
import { useStore, type TableView } from '../store';
import { ACTION_LABELS, RESPONSES, TEAM_COLORS, TRUCO_LEVELS, scoreBand, teamName, teamOfSeat, type GameView } from '../game';

/**
 * Painéis da partida: placar, de quem é a vez (com o relógio), as ações possíveis, o histórico dos pontos e
 * o fim da partida. Tudo só mostra o que o servidor mandou; nenhuma regra é decidida aqui.
 */

function useNameAt(table: TableView): (seat: number) => string {
  return (seat) => table.players.find((p) => p.seat === seat)?.name ?? `Cadeira ${seat + 1}`;
}

export function Placar({ game, table, myTeam }: { game: GameView; table: TableView; myTeam: Team | null }) {
  const nameAt = useNameAt(table);
  const level = game.hand?.truco.level ?? 1;
  return (
    <section className="placar" aria-label="Placar">
      {([0, 1] as const).map((team) => {
        const band = scoreBand(game.score[team], game.goal);
        return (
          <div key={team} className={`lado${myTeam === team ? ' meu' : ''}`} style={{ borderColor: TEAM_COLORS[team] }}>
            <span className="nome" style={{ color: TEAM_COLORS[team] }}>
              {teamName(team, game.seats, nameAt)}
              {myTeam === team && ' (você)'}
            </span>
            <strong>{game.score[team]}</strong>
            {band && <small>{band}</small>}
          </div>
        );
      })}
      <div className="meta">
        <small>até {game.goal}</small>
        <small>
          {TRUCO_LEVELS[level]} · mão vale {level}
        </small>
      </div>
    </section>
  );
}

/** Tempo que resta de quem decide agora, contado a partir de quando o estado chegou. */
function useRemaining(game: GameView): number | null {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(t);
  }, []);
  if (game.timer.remainingMs === null) return null;
  return Math.max(0, game.timer.remainingMs - (now - game.receivedAt));
}

const DECISION_TEXT: Record<string, string> = { flor: 'a Flor', envido: 'o Envido', truco: 'o Truco' };

export function Vez({ game, table, mySeat }: { game: GameView; table: TableView; mySeat: number }) {
  const nameAt = useNameAt(table);
  const remaining = useRemaining(game);
  const h = game.hand;
  if (!h || game.winner !== null) return null;
  let text: string;
  const reviewing = h.decision === 'conferencia' && h.actors.includes(mySeat);
  if (reviewing) {
    text = 'Fim da mão. Viu Flor escondida em quem levou o Envido? Conteste antes da próxima mão.';
  } else if (h.ended) {
    text = h.ended.winnerTeam === null ? 'Fim da mão.' : `${teamName(h.ended.winnerTeam, game.seats, nameAt)} ganhou a mão. Recolhendo as cartas…`;
  } else if (h.decision === 'vez') {
    text = h.turn === mySeat ? 'Sua vez: clique numa carta para jogar, ou cante.' : `Vez de ${nameAt(h.turn)}.`;
  } else {
    const pending = h.decision === 'flor' ? h.flor.pending : h.decision === 'envido' ? h.envido.pending : h.truco.pending;
    const mine = h.actors.includes(mySeat);
    const who = pending ? nameAt(pending.seat) : '';
    if (h.decision === 'truco' && h.foul && mine) text = `${who} pediu Truco antes do Envido: conteste ou responda.`;
    else text = mine ? `${who} quer ${DECISION_TEXT[h.decision]}: responda.` : `Esperando a resposta sobre ${DECISION_TEXT[h.decision]}.`;
  }
  const fraction = remaining !== null ? remaining / (game.timer.seconds * 1000) : null;
  const clock = !h.ended || reviewing;
  return (
    <div className={`vez${h.actors.includes(mySeat) && clock ? ' minha' : ''}`} role="status">
      <span>{text}</span>
      {fraction !== null && clock && (
        <span className="relogio" aria-label={`${Math.ceil(remaining! / 1000)} segundos`}>
          <span style={{ width: `${Math.round(fraction * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

const CONFIRM_MS = 3000;

/** Botões das ações que o servidor diz que valem agora; as respostas ficam destacadas. Jogar é clicando na carta. */
export function Jogadas() {
  const actions = useStore((s) => s.actions);
  const decision = useStore((s) => s.game?.hand?.decision);
  const [confirmFold, setConfirmFold] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const buttons = actions.filter((a) => a !== 'jogar');
  if (buttons.length === 0) return null;
  const responding = buttons.some((a) => RESPONSES.has(a));
  return (
    <div className={`jogadas${responding ? ' respondendo' : ''}`} role="group" aria-label="Ações">
      {buttons.map((a) => {
        if (a === 'baralho') {
          return (
            <button
              key={a}
              type="button"
              className={`baralho${confirmFold ? ' confirmar' : ''}`}
              onClick={() => {
                if (!confirmFold) {
                  setConfirmFold(true);
                  timer.current = setTimeout(() => setConfirmFold(false), CONFIRM_MS);
                  return;
                }
                clearTimeout(timer.current);
                setConfirmFold(false);
                sendAction('baralho');
              }}
            >
              {confirmFold ? 'Confirmar: ir ao baralho' : ACTION_LABELS[a]}
            </button>
          );
        }
        if (a === 'contestar') {
          return (
            <button key={a} type="button" className="contestar" onClick={() => sendAction(a)}>
              {decision === 'conferencia' ? 'Contestar a Flor' : 'Contestar: Truco antes do Envido'}
            </button>
          );
        }
        return (
          <button key={a} type="button" className={RESPONSES.has(a) ? 'resposta' : 'canto'} onClick={() => sendAction(a)}>
            {ACTION_LABELS[a] ?? a}
          </button>
        );
      })}
    </div>
  );
}

export function Historico({ game, table }: { game: GameView; table: TableView }) {
  const nameAt = useNameAt(table);
  if (game.history.length === 0) return null;
  return (
    <details className="historico">
      <summary>Pontos da partida ({game.history.length})</summary>
      <ol>
        {[...game.history].reverse().map((e, i) => (
          <li key={game.history.length - i}>
            <span className="cor" style={{ background: TEAM_COLORS[e.team] }} />
            <span>
              Mão {e.hand}: {e.detail} · <strong>{e.kind === 'contestacao' && e.value <= 0 ? `−${-e.value}` : `+${e.value}`}</strong>{' '}
              {teamName(e.team, game.seats, nameAt)}
            </span>
            <small>
              {e.score[0]} × {e.score[1]}
            </small>
          </li>
        ))}
      </ol>
    </details>
  );
}

export function FimDePartida({ game, table, isHost, myTeam }: { game: GameView; table: TableView; isHost: boolean; myTeam: Team | null }) {
  const nameAt = useNameAt(table);
  if (game.winner === null) return null;
  const won = myTeam === game.winner;
  return (
    <div className="fim-partida cartao" role="dialog" aria-label="Fim da partida">
      <h2 style={{ color: TEAM_COLORS[game.winner] }}>{myTeam === null ? `${teamName(game.winner, game.seats, nameAt)} venceu!` : won ? 'Vitória!' : 'Não foi desta vez.'}</h2>
      <p>
        {teamName(0, game.seats, nameAt)} {game.score[0]} × {game.score[1]} {teamName(1, game.seats, nameAt)}
      </p>
      {isHost ? (
        <div className="linha">
          <button type="button" className="principal" onClick={rematch}>
            Jogar de novo
          </button>
          <button type="button" onClick={endMatch}>
            Voltar à espera
          </button>
        </div>
      ) : (
        <p className="dica">O anfitrião escolhe se joga de novo.</p>
      )}
    </div>
  );
}

const ORDINAL = ['1ª', '2ª', '3ª'];

/**
 * As cartas da vaza em 2D, com o nome de quem jogou: legíveis em qualquer câmera e no celular. Mostra a
 * vaza em andamento (ou a última fechada, até a próxima carta) e o resultado das vazas anteriores.
 */
export function NaMesa({ game, table, mySeat }: { game: GameView; table: TableView; mySeat: number }) {
  const nameAt = useNameAt(table);
  const h = game.hand;
  if (!h) return null;
  let index = h.tricks.length - 1;
  if (h.tricks[index]!.plays.length === 0 && index > 0) index--;
  const trick = h.tricks[index]!;
  // Na conferência, quem ganhou o Envido mostra as cartas.
  const shown = h.review?.shown ?? [];
  if (trick.plays.length === 0 && shown.length === 0) return null;
  // Quem está levando a vaza agora (a carta mais forte até aqui), ou quem levou.
  const lead = trick.winnerSeat ?? (trick.outcome === null ? leadingSeat(trick.plays) : null);
  const done = h.tricks.slice(0, index).filter((t) => t.outcome !== null);
  return (
    <section className="na-mesa" aria-label="Cartas na mesa">
      {trick.plays.length > 0 && (
        <>
          <small>
            {ORDINAL[index]} vaza
            {trick.outcome === 'parda' ? ' · parda' : ''}
          </small>
          <div className="cartas">
            {trick.plays.map((p) => {
              const card = parseCardId(p.card)!;
              return (
                <figure key={p.seat} className={p.seat === lead ? 'levando' : ''}>
                  <img src={cardImage(card)} alt={`${RANK_NAMES[card.rank]} de ${SUIT_NAMES[card.suit]}`} />
                  <figcaption style={{ color: TEAM_COLORS[teamOfSeat(p.seat)] }}>{p.seat === mySeat ? 'você' : nameAt(p.seat)}</figcaption>
                </figure>
              );
            })}
          </div>
        </>
      )}
      {shown.map((s) => (
        <div key={s.seat} className="mostradas">
          <small style={{ color: TEAM_COLORS[teamOfSeat(s.seat)] }}>Pontos de {s.seat === mySeat ? 'você' : nameAt(s.seat)}</small>
          <div>
            {s.cards.map((id) => {
              const card = parseCardId(id)!;
              return <img key={id} src={cardImage(card)} alt={`${RANK_NAMES[card.rank]} de ${SUIT_NAMES[card.suit]}`} />;
            })}
          </div>
        </div>
      ))}
      {done.length > 0 && (
        <ol className="vazas">
          {done.map((t, i) => (
            <li key={i}>
              {ORDINAL[i]}:{' '}
              {t.outcome === 'parda' ? (
                'parda'
              ) : (
                <span style={{ color: TEAM_COLORS[t.outcome as Team] }}>{teamName(t.outcome as Team, game.seats, nameAt)}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** A carta mais forte até aqui (a primeira jogada, entre as de mesma força). */
function leadingSeat(plays: { seat: number; card: string }[]): number | null {
  let best = -1;
  let seat: number | null = null;
  for (const p of plays) {
    const power = trucoPower(parseCardId(p.card)!);
    if (power > best) {
      best = power;
      seat = p.seat;
    }
  }
  return seat;
}

/** Gritos da mesa: o último canto grande no meio da tela, as respostas menores embaixo dele. */
export function Gritos({ table }: { table: TableView }) {
  const shouts = useStore((s) => s.shouts);
  const nameAt = useNameAt(table);
  const big = shouts.filter((s) => s.big).at(-1);
  const small = shouts.filter((s) => !s.big).slice(-2);
  return (
    <div className="gritos" aria-live="assertive">
      {big && (
        <div key={big.id} className="grito" style={{ color: TEAM_COLORS[teamOfSeat(big.seat)] }}>
          <strong>{big.text}</strong>
          <span>{nameAt(big.seat)}</span>
        </div>
      )}
      {small.map((s) => (
        <div key={s.id} className="resposta-grito">
          <span>{nameAt(s.seat)}:</span> {s.text}
        </div>
      ))}
    </div>
  );
}

