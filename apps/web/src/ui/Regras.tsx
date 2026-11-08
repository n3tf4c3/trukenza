import { TURN_SECONDS, type RoomRules } from '@trukenza/shared';

export const DIFFICULTIES = {
  tranquilo: { name: 'Tranquilo', description: 'Canta menos e varia as cartas. Bom para aprender.' },
  equilibrado: { name: 'Equilibrado', description: 'Equilibra cantos, blefes e economia de cartas.' },
  competitivo: { name: 'Competitivo', description: 'Valoriza as duas melhores cartas e usa pardas para evitar perder vazas.' },
} as const;

/**
 * Escolha das regras da mesa (perfil Gaudério): tentos, Flor e tempo de cada jogada. Cada clique entrega só
 * o campo mudado: na mesa, `value` vem do estado remoto e pode estar atrasado; um objeto inteiro montado
 * com ele desfaria o clique anterior ainda não confirmado. Quem guarda as regras junta o pedaço às atuais.
 */
export function RulesPicker({ value, onChange, disabled = false }: { value: RoomRules; onChange: (patch: Partial<RoomRules>) => void; disabled?: boolean }) {
  const set = (patch: Partial<RoomRules>) => onChange(patch);
  return (
    <div className="regras">
      <div className="dificuldade">
        <div className="grupo" role="group" aria-label="Nível do computador">
          <strong>Computador</strong>
          {(Object.keys(DIFFICULTIES) as (keyof typeof DIFFICULTIES)[]).map(level =>
            <button key={level} type="button" disabled={disabled} aria-pressed={(value.botDifficulty ?? 'equilibrado') === level}
              onClick={() => set({ botDifficulty: level })}>{DIFFICULTIES[level].name}</button>)}
        </div>
        <small>{DIFFICULTIES[value.botDifficulty ?? 'equilibrado'].description} Todos usam só as próprias cartas e informações públicas.</small>
      </div>
      <div className="grupo" role="group" aria-label="Tentos da partida">
        {([12, 24] as const).map((goal) => (
          <button key={goal} type="button" disabled={disabled} aria-pressed={value.goal === goal} onClick={() => set({ goal })}>
            {goal} tentos
          </button>
        ))}
      </div>
      <div className="grupo" role="group" aria-label="Flor">
        <button type="button" disabled={disabled} aria-pressed={value.flor} onClick={() => set({ flor: true })}>
          Com Flor
        </button>
        <button type="button" disabled={disabled} aria-pressed={!value.flor} onClick={() => set({ flor: false })}>
          Sem Flor
        </button>
      </div>
      <div className="grupo" role="group" aria-label="Tempo de cada jogada">
        {TURN_SECONDS.map((s) => (
          <button key={s} type="button" disabled={disabled} aria-pressed={value.turnSeconds === s} onClick={() => set({ turnSeconds: s })}>
            {s} s por jogada
          </button>
        ))}
      </div>
    </div>
  );
}

/** As regras em uma linha, para quem não pode mudá-las. */
export function rulesSummary(r: RoomRules): string {
  return `Truco Gaudério · ${r.goal} tentos · ${r.flor ? 'com Flor' : 'sem Flor'} · ${r.turnSeconds} s por jogada · computador ${DIFFICULTIES[r.botDifficulty ?? 'equilibrado'].name.toLowerCase()}`;
}
