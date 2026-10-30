import { useState } from 'react';
import { CHARACTERS, PHASE_PLAYING, PHASE_WAITING, REFUSAL_TEXT, SEAT_FREE, SEAT_TAKEN, teamOf } from '@trukenza/shared';
import { addBots, chooseCharacter, endMatch, inviteLink, leaveRoom, removeBot, setReady, setRules, sit, stand, startMatch } from '../net';
import { TEAM_COLORS, teamOfSeat } from '../game';
import { FimDePartida, Gritos, Historico, Jogadas, NaMesa, Placar, Vez } from './Partida';
import { RulesPicker, rulesSummary } from './Regras';
import { selectMe, useStore, type TableView } from '../store';
import { CharacterPicker } from './Lobby';
import { Portrait } from './Portrait';
import { ControleSom, SomDaMesa } from './Som';
import { resetFreeCamera } from '../scene/freeCamera';

/** O que ainda falta para começar, do jeito que o servidor confere (Table.startProblem). */
function startHint(table: TableView): string | null {
  if (table.seats.some((s) => s.status !== SEAT_TAKEN)) return REFUSAL_TEXT['mesa-incompleta'];
  if (table.players.some((p) => p.seat >= 0 && !p.ready)) return REFUSAL_TEXT['faltam-prontos'];
  return null;
}

export function MesaHud() {
  const table = useStore((s) => s.table)!;
  const me = useStore(selectMe);
  const { camera, setCamera, quality, setQuality, toasts, reconnecting, character, game } = useStore();
  const mySeat = me?.seat ?? -1;
  const myTeam = mySeat >= 0 ? teamOfSeat(mySeat) : null;
  const playing = table.phase === PHASE_PLAYING && game !== null;
  const [picking, setPicking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 900);
  const isHost = me?.id === table.hostId;
  const waiting = table.phase === PHASE_WAITING;
  const seated = (me?.seat ?? -1) >= 0;
  const settled = seated && table.seats[me!.seat]?.status === SEAT_TAKEN;
  const hint = startHint(table);
  const freeSeats = table.seats.filter((s) => s.status === SEAT_FREE).length;
  const seatedCount = table.seatCount - freeSeats;
  /** Cadeiras do computador: quem está de pé pode sentar nelas, e ele cede o lugar. */
  const botSeats = new Set(table.players.filter((p) => p.bot && p.seat >= 0).map((p) => p.seat));

  const copyInvite = () => {
    void navigator.clipboard?.writeText(inviteLink(table.code)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="hud">
      <SomDaMesa />
      <header className="barra">
        <span className="marca">Trukenza</span>
        <span className="codigo">
          Mesa <code>{table.code}</code>
        </span>
        <button type="button" onClick={copyInvite}>
          {copied ? 'Link copiado!' : 'Copiar convite'}
        </button>
        <span className="espaco" />
        <ControleSom />
        <button type="button" aria-pressed={quality === 'alta'} onClick={() => setQuality(quality === 'alta' ? 'baixa' : 'alta')} title="Sombras e resolução">
          Gráficos: {quality}
        </button>
        <button type="button" onClick={leaveRoom}>
          Sair
        </button>
      </header>

      {/* Recolhível: no celular começa fechado para não cobrir a mesa. */}
      <details className="jogadores" open={panelOpen} onToggle={(e) => setPanelOpen(e.currentTarget.open)}>
        <summary>{table.phase === PHASE_PLAYING ? 'Partida em andamento' : `Na mesa (${seatedCount}/${table.seatCount})`}</summary>
        <ul>
          {table.players.map((p) => (
            <li
              key={p.id}
              className={`${p.connected ? '' : 'caiu'}${playing && game.hand?.actors.includes(p.seat) && !game.hand.ended ? ' na-vez' : ''}`}
              style={p.seat >= 0 ? { borderLeftColor: TEAM_COLORS[teamOfSeat(p.seat)] } : undefined}
            >
              <Portrait character={p.character} size={36} />
              <span>
                <strong>
                  {p.name}
                  {p.id === me?.id && ' (você)'}
                </strong>
                <small>
                  {CHARACTERS[p.character].name}
                  {p.seat >= 0 ? ` · cadeira ${p.seat + 1}` : ' · de pé'}
                  {table.seatCount === 4 && p.seat >= 0 && ` · dupla ${teamOf(p.seat) === 0 ? 'A' : 'B'}`}
                  {p.id === table.hostId && ' · anfitrião'}
                </small>
              </span>
              {p.bot ? (
                // O nome já diz que é o computador; o anfitrião pode tirá-lo na espera.
                <>
                  {isHost && waiting && (
                    <button type="button" className="tirar" aria-label={`Tirar ${p.name} da cadeira ${p.seat + 1}`} onClick={() => removeBot(p.seat)}>
                      Tirar
                    </button>
                  )}
                </>
              ) : !p.connected ? (
                <em>caiu</em>
              ) : (
                p.ready && <em className="pronto">pronto</em>
              )}
            </li>
          ))}
        </ul>
        {playing && <Historico game={game} table={table} />}
      </details>

      <footer className="acoes">
        {waiting && !seated && (
          <div className="linha">
            <span>Escolha uma cadeira (clique nela):</span>
            {table.seats.map((s, i) =>
              s.status === SEAT_FREE || botSeats.has(i) ? (
                <button key={i} type="button" onClick={() => sit(i)}>
                  Cadeira {i + 1}
                  {botSeats.has(i) && ' · computador'}
                </button>
              ) : null,
            )}
          </div>
        )}
        {waiting && seated && (
          <div className="linha">
            <button type="button" className="principal" disabled={!settled} aria-pressed={me!.ready} onClick={() => setReady(!me!.ready)}>
              {me!.ready ? 'Pronto ✓' : settled ? 'Estou pronto' : 'Sentando…'}
            </button>
            <button type="button" onClick={stand}>
              Levantar
            </button>
          </div>
        )}
        {waiting && (
          <div className="linha">
            <button type="button" onClick={() => setPicking(!picking)} aria-expanded={picking}>
              Trocar personagem
            </button>
            {isHost && freeSeats > 0 && (
              <button type="button" onClick={addBots}>
                Completar com computador
              </button>
            )}
            {isHost && (
              <button type="button" className="principal" disabled={hint !== null} title={hint ?? ''} onClick={startMatch}>
                Começar partida
              </button>
            )}
            <small className="dica">{isHost ? (hint ?? 'Tudo certo: pode começar.') : 'O anfitrião começa a partida quando todos estiverem prontos.'}</small>
          </div>
        )}
        {waiting && (
          <div className="linha regras-mesa">
            {isHost ? <RulesPicker value={table.rules} onChange={setRules} /> : <small className="dica">{rulesSummary(table.rules)}</small>}
          </div>
        )}
        {playing && (
          <>
            <Vez game={game} table={table} mySeat={mySeat} />
            {mySeat >= 0 && <Jogadas />}
            {isHost && game.winner === null && (
              <button type="button" className="discreto" onClick={endMatch}>
                Encerrar partida
              </button>
            )}
          </>
        )}
        <div className="grupo camera" role="group" aria-label="Câmera">
          <button
            type="button"
            aria-pressed={camera === 'livre'}
            title="Arraste para girar; roda do mouse ou dois dedos para aproximar; duplo clique volta"
            onClick={() => (camera === 'livre' ? resetFreeCamera() : setCamera('livre'))}
          >
            {camera === 'livre' ? 'Centralizar câmera' : 'Câmera livre'}
          </button>
          {seated && (
            <button type="button" aria-pressed={camera === 'cartas'} onClick={() => setCamera('cartas')}>
              Cartas de perto
            </button>
          )}
        </div>
      </footer>

      {picking && waiting && (
        <div className="painel-personagem cartao">
          <CharacterPicker
            value={me?.character ?? character}
            onPick={(id) => {
              chooseCharacter(id);
              setPicking(false);
            }}
          />
        </div>
      )}

      {playing && <Placar game={game} table={table} myTeam={myTeam} />}
      {playing && <NaMesa game={game} table={table} mySeat={mySeat} />}
      {playing && <Gritos table={table} />}
      {playing && <FimDePartida game={game} table={table} isHost={isHost} myTeam={myTeam} />}
      {reconnecting && <div className="faixa">Conexão instável: reconectando…</div>}
      <div className="avisos" aria-live="polite">
        {toasts.map((t) => (
          <p key={t.id}>{t.text}</p>
        ))}
      </div>
    </div>
  );
}

