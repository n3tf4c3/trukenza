import { SCENERIES, SCENERY_IDS, type SceneryId } from '@trukenza/shared';

export function SceneryPicker({ value, onChange, compact = false }: {
  value: SceneryId; onChange: (id: SceneryId) => void; compact?: boolean;
}) {
  return <div className={`cenarios${compact ? ' compacto' : ''}`} role="group" aria-label="Cenário">
    {SCENERY_IDS.map(id => <button key={id} type="button" className={`cenario-opcao cenario-${id}`}
      aria-pressed={id === value} onClick={() => onChange(id)}>
      <span className="cenario-miniatura" aria-hidden="true"><i /><b /></span>
      <span><strong>{SCENERIES[id].name}</strong>{!compact && <small>{SCENERIES[id].description}</small>}</span>
    </button>)}
  </div>;
}
