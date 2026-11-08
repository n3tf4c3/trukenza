import { useEffect, useState } from 'react';
import { PHRASE_GROUPS, PHRASE_IDS, PHRASES, SEAT_TAKEN, type PhraseGroup } from '@trukenza/shared';
import { sendPhrase } from '../net';
import { selectMe, useStore } from '../store';

const GROUPS = Object.keys(PHRASE_GROUPS) as PhraseGroup[];

/** Frases rápidas da mesa: todos ouvem na voz do seu personagem. Só o catálogo, sem texto livre. */
export function Frases() {
  const me = useStore(selectMe);
  const table = useStore(s => s.table);
  const reconnecting = useStore(s => s.reconnecting);
  const nextAt = useStore(s => s.phraseNextAt);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(timer);
  }, [open]);
  if (!me || me.seat < 0 || !table) return null;
  // Chegou à cadeira: o mesmo critério da sala (quem ainda caminha não fala pela mesa).
  const settled = table.seats[me.seat]?.status === SEAT_TAKEN;
  const waiting = Math.max(0, Math.ceil((nextAt - now) / 1000));
  const disabled = reconnecting || !settled || waiting > 0;
  const say = (id: (typeof PHRASE_IDS)[number]) => {
    sendPhrase(id);
    setNow(performance.now());
    setOpen(false);
  };
  return <details className="sinais-controle frases-controle" open={open} onToggle={e => { setNow(performance.now()); setOpen(e.currentTarget.open); }}>
    <summary>Frases</summary>
    <section className="sinais-painel frases-painel" aria-label="Frases rápidas">
      <strong>Fale com a mesa</strong>
      <p>Todos ouvem, na voz do seu personagem. As frases não dizem nada sobre as suas cartas.</p>
      {GROUPS.map(group => <div key={group} className="frases-grupo">
        <small>{PHRASE_GROUPS[group]}</small>
        <div className="frases-grade">
          {PHRASE_IDS.filter(id => PHRASES[id].group === group).map(id =>
            <button key={id} type="button" disabled={disabled} onClick={() => say(id)}>{PHRASES[id].text}</button>)}
        </div>
      </div>)}
      <small role="status">{reconnecting ? 'Aguardando reconexão.' : !settled ? 'Sente-se primeiro.'
        : waiting ? `Próxima frase em ${waiting}s.` : 'Escolha uma frase.'}</small>
    </section>
  </details>;
}
