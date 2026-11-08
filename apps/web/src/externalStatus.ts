import { useState } from 'react';

/**
 * Mensagem do lobby que também recebe avisos de fora (conexão caiu, mesa fechada por inatividade, retomada
 * que falhou). O aviso pode chegar depois da montagem (o App o repassa num efeito ao sair da mesa): quando
 * ele muda, substitui o que está na tela. Erros locais do formulário ficam até o próximo aviso diferente.
 */
export function useExternalStatus(external: string): [string, (status: string) => void] {
  const [status, setStatus] = useState(external);
  const [seen, setSeen] = useState(external);
  if (seen !== external) {
    setSeen(external);
    setStatus(external);
  }
  return [status, setStatus];
}
