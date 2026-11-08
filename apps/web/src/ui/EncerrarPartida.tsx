import { useRef } from 'react';
import { endMatch } from '../net';

/** Diálogo modal nativo: foco preso no aviso, Escape cancela e o foco retorna ao botão. */
export function EncerrarPartida() {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  return <>
    <button type="button" className="encerrar-aviso" onClick={() => {
      dialog.current?.showModal();
      cancel.current?.focus();
    }}>Encerrar partida…</button>
    <dialog ref={dialog} className="confirmar-fim" aria-labelledby="confirmar-fim-titulo" aria-describedby="confirmar-fim-texto">
      <h2 id="confirmar-fim-titulo">Encerrar a partida para todos?</h2>
      <p id="confirmar-fim-texto">O placar desta partida será descartado e todos voltarão à espera na mesma mesa.</p>
      <p className="dica">Enquanto você decide, a partida continua.</p>
      <div className="linha">
        <button ref={cancel} type="button" className="principal" onClick={() => dialog.current?.close()}>Continuar jogando</button>
        <button type="button" className="encerrar-aviso" onClick={() => {
          dialog.current?.close();
          endMatch();
        }}>Sim, encerrar para todos</button>
      </div>
    </dialog>
  </>;
}
