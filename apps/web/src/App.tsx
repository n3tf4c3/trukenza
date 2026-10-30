import { lazy, Suspense, useEffect, useState } from 'react';
import { invitedCode, loadSession, resumeRoom } from './net';
import { useStore } from './store';
import { Lobby } from './ui/Lobby';
import { MesaHud } from './ui/MesaHud';
import { HTML_LAYER_ID } from './scene/htmlLayer';

// A cena 3D (three e React Three Fiber) só baixa quando a pessoa entra numa mesa.
const MesaScene = lazy(() => import('./scene/MesaScene').then((m) => ({ default: m.MesaScene })));

/** O StrictMode roda os efeitos duas vezes em desenvolvimento: a retomada só pode sair uma vez. */
let resumeTried = false;

export function App() {
  const inRoom = useStore((s) => s.table !== null);
  const toasts = useStore((s) => s.toasts);
  const [status, setStatus] = useState('');
  const [resuming, setResuming] = useState(() => loadSession() !== null);

  useEffect(() => {
    // Página recarregada: volta à mesma cadeira se ela ainda estiver guardada (e não veio convite de outra mesa).
    if (resumeTried) return;
    resumeTried = true;
    const saved = loadSession();
    if (!saved || (invitedCode && invitedCode.toUpperCase() !== saved.code)) {
      setResuming(false);
      return;
    }
    void resumeRoom(saved).then((error) => {
      if (error) setStatus(error);
      setResuming(false);
    });
  }, []);

  // Ao sair da mesa, o último aviso (queda, sala fechada) aparece no lobby.
  useEffect(() => {
    if (!inRoom && toasts.length > 0) setStatus(toasts.at(-1)!.text);
  }, [inRoom, toasts]);

  if (resuming) return <p className="carregando">Voltando para a mesa…</p>;
  // A camada das etiquetas fica sempre na mesma posição da árvore: entrar e sair da mesa não a recria.
  return (
    <>
      {inRoom ? (
        <Suspense fallback={<p className="carregando">Arrumando a mesa…</p>}>
          <div className="cena">
            <MesaScene />
          </div>
        </Suspense>
      ) : (
        <Lobby initialStatus={status} />
      )}
      <div id={HTML_LAYER_ID} className="camada-html" hidden={!inRoom} />
      {inRoom && <MesaHud />}
    </>
  );
}

