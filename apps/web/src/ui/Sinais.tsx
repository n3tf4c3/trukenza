import { useEffect, useState } from 'react';
import { SIGNAL_IDS, SIGNALS } from '@trukenza/shared';
import { sendSignal } from '../net';
import { selectMe, useStore } from '../store';

export function Sinais() {
  const table = useStore(s => s.table);
  const me = useStore(selectMe);
  const hand = useStore(s => s.game?.hand);
  const winner = useStore(s => s.game?.winner);
  const reconnecting = useStore(s => s.reconnecting);
  const nextAt = useStore(s => s.signalNextAt);
  const sent = useStore(s => me ? s.signals[me.seat] : undefined);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, [open]);
  if (table?.seatCount !== 4 || !me || me.seat < 0 || !hand || winner !== null) return null;
  const partner = table.players.find(p => p.seat === (me.seat + 2) % 4);
  const waiting = Math.max(0, Math.ceil((nextAt - now) / 1000));
  const disabled = reconnecting || !!hand.ended || !!hand.folded[me.seat] || waiting > 0;
  return <details className="sinais-controle" open={open} onToggle={e => { setNow(performance.now()); setOpen(e.currentTarget.open); }}>
    <summary>Sinais da dupla</summary>
    <section className="sinais-painel" aria-label="Sinais da dupla">
      <strong>Para {partner?.name ?? 'seu parceiro'}</strong>
      <p>Gestos visíveis para todos. Escolha o momento: o adversário também pode perceber.</p>
      <div className="sinais-grade">
        {SIGNAL_IDS.map(id => <button key={id} type="button" disabled={disabled} onClick={() => sendSignal(id)}>
          <span>{SIGNALS[id].label}</span><small>{SIGNALS[id].meaning}</small>
        </button>)}
      </div>
      <small role="status">{reconnecting ? 'Aguardando reconexão.' : hand.ended ? 'Aguarde a próxima mão.'
        : hand.folded[me.seat] ? 'Você foi ao baralho nesta mão.' : waiting ? `Próximo sinal em ${waiting}s.`
        : sent?.hand === hand.number ? `Você fez: ${SIGNALS[sent.signal].label.toLowerCase()}.` : 'Escolha um gesto. Você também pode blefar.'}</small>
      {partner?.bot && <small>O computador considera seu último sinal e pode acreditar num blefe. Sinais de força valem até você jogar outra carta; os de Envido, até o fim da mão.</small>}
    </section>
  </details>;
}
