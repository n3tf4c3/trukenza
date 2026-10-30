import { TURN_SECONDS, type RoomRules } from '@trukenza/shared';

/** Escolha das regras da mesa (perfil Gaudério): tentos, Flor e tempo de cada jogada. */
export function RulesPicker({ value, onChange, disabled = false }: { value: RoomRules; onChange: (r: RoomRules) => void; disabled?: boolean }) {
  const set = (patch: Partial<RoomRules>) => onChange({ ...value, ...patch });
  return (
    <div className="regras">
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
  return `Truco Gaudério · ${r.goal} tentos · ${r.flor ? 'com Flor' : 'sem Flor'} · ${r.turnSeconds} s por jogada`;
}
