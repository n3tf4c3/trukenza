import { useEffect, useRef } from 'react';
import { selectMe, useStore } from '../store';
import { sfx, startAmbient, stopAmbient } from '../sound';
import { speakCall } from '../voice';

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
  const scenery = useStore(s => s.table?.scenery ?? 'bolicho');

  useEffect(() => {
    startAmbient(scenery);
    return stopAmbient;
  }, [scenery]);

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
  const soundOn = useStore((s) => s.soundOn);
  const volume = useStore((s) => s.volume);
  const musicOn = useStore((s) => s.musicOn);
  const musicVolume = useStore((s) => s.musicVolume);
  const voiceOn = useStore((s) => s.voiceOn);
  const voiceVolume = useStore((s) => s.voiceVolume);
  const voiceId = useStore((s) => s.voiceId);
  const voices = useStore((s) => s.voices);
  const voiceStatus = useStore((s) => s.voiceStatus);
  const voiceFallback = useStore((s) => s.voiceFallback);
  const speaking = useStore((s) => s.speaking);
  const { setSoundOn, setVolume, setMusicOn, setMusicVolume, setVoiceOn, setVoiceVolume, setVoiceId } = useStore.getState();
  return (
    <span className="som" role="group" aria-label="Som">
      <button type="button" aria-pressed={soundOn} onClick={() => setSoundOn(!soundOn)} title="Volume geral: vozes, efeitos, ambiente e música">
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
      <details className="musica-controle">
        <summary>Áudio</summary>
        <div className="musica-painel">
          <strong>Gritos da mesa</strong>
          <button type="button" aria-pressed={voiceOn} onClick={() => setVoiceOn(!voiceOn)}>
            Vozes: {voiceOn ? 'ligadas' : 'desligadas'}
          </button>
          <label>Volume das vozes
            <input type="range" min={0} max={1} step={0.05} value={voiceVolume} disabled={!voiceOn || !soundOn}
              onChange={e => setVoiceVolume(Number(e.currentTarget.value))} />
          </label>
          <label>Voz em português
            <select value={voices.some(v => v.id === voiceId) ? voiceId : ''} onChange={e => setVoiceId(e.currentTarget.value)}>
              <option value="">Voz do jogo (local)</option>
              {voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <button type="button" disabled={!voiceOn || !soundOn || volume === 0 || voiceVolume === 0}
            onClick={() => {
              const state = useStore.getState();
              const me = selectMe(state);
              speakCall('truco', me?.character ?? state.character, me?.seat ?? -1);
            }}>Ouvir Truco!</button>
          <button type="button" disabled={!voiceOn || !soundOn || volume === 0 || voiceVolume === 0}
            onClick={() => {
              const state = useStore.getState();
              const me = selectMe(state);
              speakCall('previa', me?.character ?? state.character, me?.seat ?? -1);
            }}>Testar gritos</button>
          <small role="status">{voiceStatus === 'error' ? 'A voz não respondeu. Toque em Testar gritos para tentar novamente.'
            : speaking ? `Falando: ${speaking.text}`
            : voiceFallback ? 'A voz escolhida não iniciou a tempo. Usando a voz local do jogo.'
            : 'Falas sintetizadas, com ritmo e tom de cada personagem.'}</small>
          <hr />
          <span>Violão da mesa</span>
          <button type="button" aria-pressed={musicOn} onClick={() => setMusicOn(!musicOn)}>
            Música: {musicOn ? 'ligada' : 'desligada'}
          </button>
          <label>Volume da música
            <input type="range" min={0} max={1} step={0.05} value={musicVolume} disabled={!musicOn || !soundOn}
              onChange={(e) => setMusicVolume(Number(e.currentTarget.value))} />
          </label>
          <button type="button" disabled={!soundOn || volume === 0} onClick={() => {
            sfx('carta'); sfx('canto', 0.9); sfx('quero', 1.8); sfx('vitoria', 2.7);
          }}>Ouvir efeitos</button>
        </div>
      </details>
    </span>
  );
}
