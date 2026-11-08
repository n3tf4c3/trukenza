import { useRef, useState } from 'react';
import { createDeck, trucoPower, RANK_NAMES, SUIT_NAMES } from '@trukenza/game-engine';
import { SIGNAL_IDS, SIGNALS } from '@trukenza/shared';
import { cardImage } from '../cardArt';
import { useStore } from '../store';
import { rulesSummary } from './Regras';

const deck = createDeck();
const pluralFigures: Record<number, string> = { 10: 'Todas as Sotas', 11: 'Todos os Cavalos', 12: 'Todos os Reis' };
const hierarchy = [...new Set(deck.map(trucoPower))].sort((a, b) => b - a).map(power => {
  const cards = deck.filter(c => trucoPower(c) === power);
  return { cards, label: cards.length === 4 ? (pluralFigures[cards[0]!.rank] ?? `Todos os ${RANK_NAMES[cards[0]!.rank]}`)
    : cards.map(c => `${RANK_NAMES[c.rank]} de ${SUIT_NAMES[c.suit]}`).join(' e ') };
});
const TOPICS = ['Cartas', 'Cantos', 'Vazas', 'Sinais'] as const;
type Topic = typeof TOPICS[number];

/** Consulta local: não envia ação, não revela carta e não pausa a mesa. */
export function Ajuda() {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [topic, setTopic] = useState<Topic>('Cartas');
  const rules = useStore(s => s.table?.rules);
  return <>
    <button type="button" className="abrir-ajuda" onClick={() => { dialog.current?.showModal(); close.current?.focus(); }}>Como jogar</button>
    <dialog ref={dialog} className="ajuda-mesa" aria-labelledby="ajuda-titulo" aria-describedby="ajuda-aviso">
      <header className="ajuda-cabecalho">
        <div><small>TRUCO ESPANHOL · GAUDÉRIO</small><h2 id="ajuda-titulo">Como jogar</h2></div>
        <button ref={close} type="button" onClick={() => dialog.current?.close()}>Voltar à mesa</button>
      </header>
      <p id="ajuda-aviso">A partida continua enquanto você consulta. Feche com Escape ou “Voltar à mesa”.</p>
      {rules && <p className="ajuda-regras">Nesta mesa: {rulesSummary(rules)}</p>}
      <nav className="ajuda-topicos" aria-label="Assuntos da ajuda">
        {TOPICS.map(t => <button key={t} type="button" aria-pressed={topic === t} onClick={() => { setTopic(t); dialog.current?.scrollTo({ top: 0 }); }}>{t}</button>)}
      </nav>
      <section className="ajuda-conteudo" aria-label={topic}>
        {topic === 'Cartas' && <>
          <h3>Da mais forte à mais fraca</h3>
          <p>Três cartas por jogador. Sem vira: a força é sempre a mesma. Cartas do mesmo nível empatam.</p>
          <ol className="hierarquia-cartas">{hierarchy.map(({ cards, label }, i) => <li key={i}>
            <span className="forca-numero">{i + 1}</span>
            <img src={cardImage(cards[0]!)} alt="" width={40} height={60} />
            <span>{label}{i < 4 && <small>Manilha fixa</small>}</span>
          </li>)}</ol>
          <p>Na sua vez, clique ou toque numa carta e confirme em Jogar. Você pode trocar a seleção antes de confirmar. No teclado, 1–3 seleciona, Enter joga e Esc cancela. Arrastar a mesa gira a câmera; não joga uma carta.</p>
        </>}
        {topic === 'Cantos' && <>
          <h3>Truco: aumenta o valor da mão</h3>
          <table><thead><tr><th>Pedido</th><th>Quero</th><th>Não quero</th></tr></thead>
            <tbody><tr><th>Truco</th><td>2</td><td>1</td></tr><tr><th>Retruco</th><td>3</td><td>2</td></tr><tr><th>Vale Quatro</th><td>4</td><td>3</td></tr></tbody></table>
          <p>Os valores são tentos. Recusar entrega o valor anterior a quem pediu e acaba a mão. Depois do aceite, só a equipe que aceitou pode aumentar na própria vez.</p>
          <h3>Envido: disputa de pontos nas cartas</h3>
          <p>Duas do mesmo naipe: some as duas maiores e mais 20. Sem par de naipe, vale a maior sozinha. Sota, Cavalo e Rei valem zero. Exemplo: 7 e 6 de ouros dão 33.</p>
          <p>Na dupla vale o maior Envido, sem somar os parceiros. Envido vale 2, Real Envido vale 3; os cantos somam. Falta Envido vale a meta menos o placar de quem está na frente. Os botões de resposta mostram os tentos da disputa atual.</p>
          <p>Só na primeira vaza, antes de jogar sua primeira carta. Em duplas, só os dois últimos da ordem podem abrir. Pode vir antes da resposta ao primeiro Truco; Truco aceito fecha o Envido.</p>
          <h3>Flor{rules && !rules.flor ? ' · desligada nesta mesa' : ''}</h3>
          <p>Três cartas do mesmo naipe. A soma das três mais 20 decide a melhor Flor; figuras valem zero. Anunciar anula o Envido. Flor de um lado só vale 3 por Flor; dos dois lados, a básica soma 3 por Flor participante.</p>
          <p>Contra-Flor dobra a básica; Contra-Flor e o Resto vale a Falta. “Me achico” entrega o valor estabelecido antes do último aumento. Nesta modalidade a Flor pode ser escondida, mas há contestação se ela ficar à vista na conferência do Envido.</p>
          <h3>Contestações</h3>
          <p>Truco antes da oportunidade do Envido pode ser contestado enquanto você responde: queima o Envido e tira até 2 tentos de quem pediu. No fim da mão, se quem levou o Envido mostrar Flor escondida, a contestação transfere esses pontos. Use os botões quando aparecerem.</p>
        </>}
        {topic === 'Vazas' && <>
          <h3>Ganhar duas vazas vence a mão</h3>
          <p>Uma vaza é uma rodada de cartas. Quem joga a mais forte leva e abre a próxima. Os parceiros ficam frente a frente. O “mão” joga primeiro e tem prioridade nos desempates.</p>
          <dl><dt>Empatou a primeira?</dt><dd>A segunda decide. Se empatar de novo, decide a terceira.</dd>
            <dt>Ganhou a primeira e empatou a segunda?</dt><dd>Você ganhou a mão.</dd>
            <dt>Uma vaza para cada equipe e empate na terceira?</dt><dd>Ganha quem levou a primeira.</dd>
            <dt>Três empates?</dt><dd>Ganha a equipe do mão.</dd></dl>
          <p>Entre parceiros, cartas de mesma força ganham juntas; abre a próxima quem jogou primeiro. Entre adversários, dá parda.</p>
          <h3>Ir ao baralho</h3><p>Você desiste da mão sem mostrar suas cartas. Em duplas, seu parceiro continua; se todos da equipe desistirem, o outro lado leva os tentos devidos.</p>
          <h3>Tempo e conexão</h3><p>Quando o relógio termina, o computador decide. Se a conexão cair, sua cadeira fica guardada por 60 segundos; o computador pode jogar enquanto você volta.</p>
        </>}
        {topic === 'Sinais' && <>
          <h3>Combine a jogada com seu parceiro</h3>
          <p>Use “Sinais da dupla” numa mesa de quatro. Todos podem perceber o gesto, inclusive adversários. Você escolhe o sinal e pode blefar.</p>
          <dl className="ajuda-sinais">{SIGNAL_IDS.map(id => <div key={id}><dt>{SIGNALS[id].label}</dt><dd>{SIGNALS[id].meaning}</dd></div>)}</dl>
          <p>O computador considera o último sinal do parceiro para jogar e responder aos cantos. Pode acreditar em um blefe. Sinais de força valem até o autor jogar outra carta; os de Envido, até o fim da mão. Quem foi ao baralho deixa de ser considerado.</p>
          <p>O gesto dura 1,8 s, com intervalo de 2,5 s entre sinais. Não altera o turno nem o relógio. O computador ainda não emite sinais.</p>
        </>}
      </section>
    </dialog>
  </>;
}
