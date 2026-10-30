import { CHARACTERS, type CharacterId } from '@trukenza/shared';

/** Retrato 2D com os mesmos traços do boneco 3D (cores, cabelo, acessórios). */

const SKIN: Record<CharacterId, string> = { neymt: '#e7b08a', presuntinho: '#ffaec0', moleti: '#e0a376', baiaca: '#6f4428' };
const FEATHERS = ['#e63946', '#f4a261', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f15bb5'];

function Extras({ id }: { id: CharacterId }) {
  const info = CHARACTERS[id];
  switch (id) {
    case 'neymt':
      return (
        <>
          {FEATHERS.map((c, i) => {
            const a = ((i - 3) / 3) * 60;
            return <ellipse key={c} cx="50" cy="16" rx="5" ry="17" fill={c} transform={`rotate(${a} 50 40)`} />;
          })}
          <rect x="30" y="34" width="40" height="6" rx="3" fill={info.accent} />
          <path d="M33 45 l10 -4 M67 45 l-10 -4" stroke={info.accent} strokeWidth="3" strokeLinecap="round" />
          <circle cx="27" cy="62" r="4" fill="none" stroke={info.accent} strokeWidth="2" />
          <circle cx="73" cy="62" r="4" fill="none" stroke={info.accent} strokeWidth="2" />
        </>
      );
    case 'presuntinho':
      return (
        <>
          <path d="M28 34 L22 14 L42 26 Z M72 34 L78 14 L58 26 Z" fill="#ff9fb4" stroke="#c46a7f" strokeWidth="2" />
          <ellipse cx="50" cy="62" rx="12" ry="9" fill="#ff8fa8" stroke="#c46a7f" strokeWidth="2" />
          <circle cx="46" cy="62" r="2.2" fill="#8a3a4c" />
          <circle cx="54" cy="62" r="2.2" fill="#8a3a4c" />
        </>
      );
    case 'moleti':
      return (
        <>
          <path d="M26 46 Q24 22 50 20 Q76 22 74 46 Q66 32 50 32 Q34 32 26 46 Z" fill="#4a2c16" />
          <path d="M26 46 Q20 70 30 82 L36 70 Z M74 46 Q80 70 70 82 L64 70 Z" fill="#4a2c16" />
          <path d="M40 64 Q50 60 60 64" stroke="#3a210f" strokeWidth="5" strokeLinecap="round" fill="none" />
        </>
      );
    case 'baiaca':
      return (
        <>
          <path d="M24 38 Q50 6 76 38 Z" fill={info.main} />
          <rect x="24" y="33" width="52" height="6" fill="#f2c21b" />
          <rect x="26" y="38" width="48" height="5" fill={info.accent} />
          <path d="M36 70 Q50 84 64 70 Q58 78 50 78 Q42 78 36 70 Z" fill="#2a1a10" />
        </>
      );
  }
}

export function Portrait({ character, size = 64 }: { character: CharacterId; size?: number }) {
  const info = CHARACTERS[character];
  const mouth = character === 'baiaca' ? 'M40 66 Q50 74 60 66' : 'M42 68 Q50 74 58 68';
  return (
    <svg className="retrato" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={info.name}>
      <circle cx="50" cy="50" r="48" fill={info.main} />
      <path d="M18 100 Q50 78 82 100 Z" fill={info.accent} />
      <circle cx="50" cy="52" r={character === 'presuntinho' ? 27 : 24} fill={SKIN[character]} />
      <circle cx="42" cy="50" r="6.5" fill="#fff" />
      <circle cx="58" cy="50" r="6.5" fill="#fff" />
      <circle cx="42.5" cy="51" r="3" fill="#1c1410" />
      <circle cx="57.5" cy="51" r="3" fill="#1c1410" />
      {character !== 'presuntinho' && <path d={mouth} stroke="#6b2a20" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
      <Extras id={character} />
    </svg>
  );
}
