import { CHARACTERS, type CharacterId } from '@trukenza/shared';

/** Retrato 2D com os mesmos traços do boneco 3D (cores, cabelo, acessórios). */

const SKIN: Record<CharacterId, string> = { neymt: '#e7b08a', presuntinho: '#ffaec0', moleti: '#e0a376', baiaca: '#6f4428', luistesoura: '#d8a077', sardinha: '#84929d', gordodofusca: '#ad734d', tiba: '#c78c64', negon: '#633d2a' };
const FEATHERS = ['#e63946', '#f4a261', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f15bb5'];

function Extras({ id }: { id: CharacterId }) {
  const info = CHARACTERS[id];
  switch (id) {
    case 'negon':
      return (
        <>
          <path d="M20 45 Q12 15 50 13 Q86 14 80 45 L75 31 Q50 22 25 32 Z" fill="#211a17" />
          {[27, 38, 50, 62, 73].map((x) => <circle key={x} cx={x} cy={23 + Math.abs(50 - x) * 0.10} r="5" fill="#2c211b" />)}
          <path d="M35 64 Q50 78 65 64 Q65 81 50 81 Q35 80 35 64Z" fill="#301b16" />
          <path d="M37 66 Q50 74 63 66 L61 74 Q50 80 39 74 Z" fill="#fff8e8" />
          <path d="M39 71 Q50 77 61 71" stroke="#75838c" strokeWidth="1.5" fill="none" />
          {[41, 47, 53, 59].map((x) => <rect key={x} x={x - 1.5} y={71 + (x > 44 && x < 56 ? 1.5 : 0)} width="3" height="3" rx="0.6" fill="#b4c9d5" stroke="#66747c" strokeWidth="0.5" />)}
          <path d="M38 86 Q50 94 62 86" stroke={info.accent} strokeWidth="3" fill="none" />
        </>
      );
    case 'tiba':
      return (
        <>
          <path d="M26 46 Q20 28 34 23 Q46 10 65 24 L72 20 Q81 30 74 44 L65 34 Q47 27 29 39Z" fill="#29221e" />
          <path d="M35 43 L44 40 M56 40 L65 43" stroke="#29221e" strokeWidth="3" strokeLinecap="round" />
          <path d="M29 59 L38 61 M62 61 L71 59" stroke="#202126" strokeWidth="3" />
          <path d="M29 63 L38 65 M62 65 L71 63" stroke="#fffaf0" strokeWidth="3" />
          <path d="M35 81 Q50 89 65 81" stroke="#202126" strokeWidth="4" fill="none" />
          <path d="M60 86 L69 96 M69 86 L60 96 M64.5 85 V98" stroke="#c63434" strokeWidth="1.5" />
          <circle cx="64.5" cy="91" r="4" fill="#fffaf0" stroke="#202126" strokeWidth="1.5" />
          <path d="M62 90 H67 M64.5 88 V94" stroke="#202126" strokeWidth="1" />
          <text x="43" y="96" textAnchor="middle" fontSize="5" fontWeight="900" fill="#202126">TIMÃO</text>
        </>
      );
    case 'gordodofusca':
      return (
        <>
          <path d="M24 47 Q15 37 20 28 Q17 17 29 14 Q34 3 45 8 Q54 1 63 10 Q77 8 81 21 Q90 28 79 46 L73 36 Q50 21 27 37 Z" fill="#241a16" />
          {[27, 38, 50, 62, 73].map((x, i) => <circle key={x} cx={x} cy={22 - Math.sin(i * Math.PI / 4) * 9} r="6" fill="#33241c" />)}
          <path d="M34 87 Q39 76 53 80 L62 87 Q72 87 73 94 H28 Q27 87 34 87Z" fill={info.accent} />
          <path d="M38 86 Q42 79 48 81 V86 Z M51 81 Q57 82 60 86 H51Z" fill="#344f57" />
          <circle cx="37" cy="94" r="4" fill="#302c29" /><circle cx="65" cy="94" r="4" fill="#302c29" />
          <circle cx="37" cy="94" r="1.8" fill="#f7ead0" /><circle cx="65" cy="94" r="1.8" fill="#f7ead0" />
        </>
      );
    case 'luistesoura':
      return (
        <>
          <path d="M36 32 Q42 27 50 29" stroke="#f4c5a2" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M33 42 L43 41 M57 41 L67 42" stroke="#4d3025" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M40 63 Q45 60 50 63 Q55 60 60 63" stroke="#4d3025" strokeWidth="3" fill="none" />
          <path d="M31 82 L34 99 M69 82 L66 99" stroke={info.accent} strokeWidth="4" />
          <path d="M43 87 L54 98 M54 87 L43 98" stroke="#e0e6e9" strokeWidth="2" />
          <circle cx="42" cy="98" r="3" fill="none" stroke={info.accent} strokeWidth="2" />
          <circle cx="55" cy="98" r="3" fill="none" stroke={info.accent} strokeWidth="2" />
          <path d="M62 85 V96 M62 87 H67 M62 90 H67 M62 93 H67" stroke="#b84c45" strokeWidth="2" />
        </>
      );
    case 'sardinha':
      return (
        <>
          <path d="M27 38 L25 14 L43 29 M57 29 L75 14 L73 38" fill={SKIN.sardinha} stroke="#596975" strokeWidth="2" />
          <path d="M30 29 L29 21 L37 29 M63 29 L71 21 L70 29" fill="#dfa0a0" />
          <ellipse cx="43" cy="64" rx="9" ry="7" fill="#eee6d4" />
          <ellipse cx="57" cy="64" rx="9" ry="7" fill="#eee6d4" />
          <path d="M45 58 Q50 56 55 58 L50 63 Z" fill="#c67d81" />
          <path d="M35 62 L20 58 M35 66 L19 67 M65 62 L80 58 M65 66 L81 67" stroke="#e9e0ca" strokeWidth="1.6" strokeLinecap="round" />
          <ellipse cx="53" cy="88" rx="11" ry="6" fill={info.accent} />
          <path d="M44 88 L34 81 V95 Z M48 83 L53 77 L57 83" fill={info.accent} />
          <circle cx="59" cy="87" r="1.5" fill="#263e50" />
        </>
      );
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
      <path d={character === 'negon' ? 'M28 100 Q32 83 50 84 Q68 83 72 100Z' : character === 'gordodofusca' ? 'M7 100 Q14 75 50 76 Q86 75 93 100 Z' : 'M18 100 Q50 68 82 100 Z'} fill={character === 'sardinha' || character === 'luistesoura' || character === 'gordodofusca' || character === 'negon' ? info.main : info.accent} />
      <circle cx="50" cy="52" r={character === 'negon' ? 32 : character === 'presuntinho' || character === 'gordodofusca' ? 27 : 24} fill={SKIN[character]} />
      <circle cx="42" cy="50" r="6.5" fill="#fff" />
      <circle cx="58" cy="50" r="6.5" fill="#fff" />
      <ellipse cx={character === 'sardinha' ? 44 : 42.5} cy={character === 'sardinha' ? 54 : 51} rx={character === 'sardinha' ? 2 : 3} ry="3" fill="#1c1410" />
      <ellipse cx="57.5" cy="51" rx={character === 'sardinha' ? 2 : 3} ry="3" fill="#1c1410" />
      {character !== 'presuntinho' && <path d={mouth} stroke="#6b2a20" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
      <Extras id={character} />
    </svg>
  );
}
