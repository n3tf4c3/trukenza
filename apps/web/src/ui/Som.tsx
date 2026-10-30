import { useEffect, useRef } from 'react';
import { selectMe, useStore } from '../store';
import { sfx, startAmbient, stopAmbient } from '../sound';

/** Segundos finais do relógio em que soa o tique (os dois últimos mais agudos). */
const TICK_FROM = 5;

/**
 * Som da mesa: o ambiente do bolicho enquanto se está nela, o aviso quando a decisão passa a ser sua
 * e o tique nos últimos segundos do seu relógio. Os sons dos acontecimentos saem do `stage` em `net.ts`.
 */
export function SomDaMesa() {
  const myTurn = useStore((s) => s.actions.length > 0);
  const game = useStore((s) => s.game);
  const mySeat = useStore((s) => selectMe(s)?.seat ?? -1);

  useEffect(() => {
    startAmbient();
    return stopAmbient;
  }, []);

  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) sfx('vez');
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  // O mesmo relógio do painel "Vez": vale enquanto a mão corre ou na conferência em que você decide.
  const h = game?.hand;
  const deciding = !!game && !!h && game.winner === null && h.actors.includes(mySeat) && (!h.ended || h.decision === 'conferencia');
  const remainingMs = deciding ? game.timer.remainingMs : null;
  const receivedAt = game?.receivedAt ?? 0;
  // Último segundo que já soou: sobrevive a estados novos no meio da mesma decisão (sem tique repetido).
  const lastTick = useRef(Infinity);
  useEffect(() => {
    if (remainingMs === null) {
      lastTick.current = Infinity;
      return;
    }
    const check = () => {
      const left = Math.ceil((remainingMs - (performance.now() - receivedAt)) / 1000);
      // O relógio voltou a crescer: é outra decisão.
      if (left > lastTick.current + 1) lastTick.current = Infinity;
      if (left >= 1 && left <= TICK_FROM && left < lastTick.current) sfx(left <= 2 ? 'tique-final' : 'tique');
      lastTick.current = Math.min(lastTick.current, left);
    };
    check();
    const t = setInterval(check, 100);
    return () => clearInterval(t);
  }, [remainingMs, receivedAt]);

  return null;
}

/** Botão de som (liga e desliga) e volume, na barra de cima. */
export function ControleSom() {
  const { soundOn, setSoundOn, volume, setVolume } = useStore();
  return (
    <span className="som" role="group" aria-label="Som">
      <button type="button" aria-pressed={soundOn} onClick={() => setSoundOn(!soundOn)} title="Efeitos e ambiente do bolicho">
        Som: {soundOn ? 'ligado' : 'desligado'}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        disabled={!soundOn}
        aria-label="Volume"
        onChange={(e) => setVolume(Number(e.currentTarget.value))}
      />
    </span>
  );
}
