import type { GraphName } from '@/content/prompts/index.ts';

interface PromptMascotProps {
  graphs: GraphName[];
}

export default function PromptMascot({ graphs }: PromptMascotProps) {
  const level = graphs.length;

  // Hair color darkens with level
  const hairColor =
    level === 0 ? '#bdbdbd'
    : level <= 2 ? '#8d6e63'
    : level <= 4 ? '#5d4037'
    : '#3e2723';

  // Skin gets warmer with level
  const skinColor =
    level === 0 ? '#e0e0e0'
    : level <= 2 ? '#ffe0b2'
    : level <= 4 ? '#ffcc80'
    : '#ffb74d';

  // Eye size grows
  const eyeRx = level === 0 ? 2 : level <= 2 ? 2.5 : level <= 4 ? 3 : 3.5;
  const eyeRy = level === 0 ? 2.5 : level <= 2 ? 3 : level <= 4 ? 3.5 : 4;

  // Eyebrow angle: worried → neutral → confident
  const browL =
    level === 0 ? 'M22,26 Q27,23 32,25'   // worried up
    : level <= 2 ? 'M22,25 L32,25'          // flat
    : level <= 4 ? 'M22,26 Q27,23 32,25'    // slight arch
    : 'M21,27 Q27,22 33,25';                // confident arch

  const browR =
    level === 0 ? 'M38,25 Q43,23 48,26'
    : level <= 2 ? 'M38,25 L48,25'
    : level <= 4 ? 'M38,25 Q43,23 48,26'
    : 'M37,25 Q43,22 49,27';

  // Mouth
  const mouth =
    level === 0 ? <path d="M28,42 Q35,39 42,42" stroke="#888" strokeWidth={1.5} fill="none" strokeLinecap="round" />
    : level <= 1 ? <line x1={30} y1={41} x2={40} y2={41} stroke="#666" strokeWidth={1.5} strokeLinecap="round" />
    : level <= 2 ? <path d="M29,40 Q35,43 41,40" stroke="#666" strokeWidth={1.5} fill="none" strokeLinecap="round" />
    : level <= 4 ? <path d="M27,39 Q35,46 43,39" stroke="#555" strokeWidth={1.5} fill="none" strokeLinecap="round" />
    : <path d="M26,38 Q35,48 44,38" stroke="#444" strokeWidth={1.8} fill="none" strokeLinecap="round" />;

  // Hair style changes with level
  const hair =
    level === 0 ? (
      // Sparse, messy
      <path d="M18,30 Q20,16 35,14 Q50,16 52,30" fill={hairColor} />
    ) : level <= 2 ? (
      // Basic hair
      <>
        <path d="M16,30 Q18,12 35,10 Q52,12 54,30" fill={hairColor} />
        <path d="M18,30 Q20,18 35,16 Q50,18 52,30" fill={hairColor} opacity={0.7} />
      </>
    ) : level <= 4 ? (
      // Fuller hair with side part
      <>
        <path d="M14,32 Q16,10 35,8 Q54,10 56,32" fill={hairColor} />
        <path d="M16,32 Q18,14 35,12 Q52,14 54,32" fill={hairColor} opacity={0.7} />
        <path d="M20,18 Q25,14 30,16" fill={hairColor} stroke={hairColor} strokeWidth={2} />
      </>
    ) : (
      // Full styled hair with volume
      <>
        <path d="M12,33 Q14,6 35,5 Q56,6 58,33" fill={hairColor} />
        <path d="M14,33 Q16,12 35,10 Q54,12 56,33" fill={hairColor} opacity={0.8} />
        <path d="M18,16 Q25,10 32,14" fill={hairColor} stroke={hairColor} strokeWidth={3} />
        <path d="M14,25 Q12,20 14,15" fill="none" stroke={hairColor} strokeWidth={3} strokeLinecap="round" />
      </>
    );

  // Cheek blush at high levels
  const blush = level >= 4;

  return (
    <svg viewBox="0 0 70 65" width="100%" height="100%" style={{ display: 'block' }}>
      {/* Head */}
      <ellipse cx={35} cy={35} rx={22} ry={24} fill={skinColor} />

      {/* Hair */}
      <g style={{ transition: 'all 400ms ease' }}>{hair}</g>

      {/* Eyes */}
      <g style={{ transition: 'all 300ms ease' }}>
        <ellipse cx={27} cy={33} rx={eyeRx} ry={eyeRy} fill="#333" />
        <ellipse cx={43} cy={33} rx={eyeRx} ry={eyeRy} fill="#333" />
        {/* Highlights */}
        {level > 0 && (
          <>
            <circle cx={28} cy={31.5} r={1} fill="#fff" />
            <circle cx={44} cy={31.5} r={1} fill="#fff" />
          </>
        )}
      </g>

      {/* Eyebrows */}
      <g style={{ transition: 'all 300ms ease' }}>
        <path d={browL} stroke="#555" strokeWidth={1.2} fill="none" strokeLinecap="round" />
        <path d={browR} stroke="#555" strokeWidth={1.2} fill="none" strokeLinecap="round" />
      </g>

      {/* Mouth */}
      <g style={{ transition: 'all 300ms ease' }}>{mouth}</g>

      {/* Blush */}
      {blush && (
        <>
          <ellipse cx={20} cy={38} rx={4} ry={2.5} fill="#ffab91" opacity={0.4} />
          <ellipse cx={50} cy={38} rx={4} ry={2.5} fill="#ffab91" opacity={0.4} />
        </>
      )}
    </svg>
  );
}
