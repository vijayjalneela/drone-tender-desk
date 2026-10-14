// Home page banner (frontend-spec §7.1): a quadcopter and a counter-drone radar,
// drawn here as inline SVG. Deliberately no spokes or lines out from the radar's
// centre, and the radar is green rather than navy, so it can never resemble the
// Ashoka Chakra. The drawing is decorative; the tagline is the content.

const RADAR = { x: 232, y: 80 }
const RADAR_GREEN = '#15803d'

const TAGLINE = 'Every drone and counter-drone tender from central and state buyers, in one place.'

function Quadcopter() {
  const rotors = [
    [62, 46],
    [122, 46],
    [62, 114],
    [122, 114],
  ]
  return (
    <g data-part="drone">
      {rotors.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <line x1={92} y1={80} x2={x} y2={y} stroke="var(--color-navy-900)" strokeWidth={6} strokeLinecap="round" />
          <ellipse cx={x} cy={y} rx={22} ry={6} fill="var(--color-navy-700)" opacity={0.35} />
          <circle cx={x} cy={y} r={5} fill="var(--color-navy-900)" />
        </g>
      ))}
      <rect x={74} y={66} width={36} height={28} rx={8} fill="var(--color-navy-900)" />
      <circle cx={92} cy={80} r={5} fill="var(--color-saffron-100)" />
    </g>
  )
}

function Radar() {
  const rings = [22, 44, 66]
  return (
    <g data-part="radar">
      <defs>
        <radialGradient id="sweep-fade" cx={RADAR.x} cy={RADAR.y} r={66} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={RADAR_GREEN} stopOpacity={0.05} />
          <stop offset="100%" stopColor={RADAR_GREEN} stopOpacity={0.35} />
        </radialGradient>
      </defs>
      {rings.map((r) => (
        <circle key={r} cx={RADAR.x} cy={RADAR.y} r={r} fill="none" stroke={RADAR_GREEN} strokeWidth={2} opacity={0.55} />
      ))}
      {/* One soft wedge, filled only (no outline), turning slowly unless reduced motion is asked for. */}
      <g
        data-part="sweep"
        className="motion-safe:animate-[spin_8s_linear_infinite]"
        style={{ transformOrigin: `${RADAR.x}px ${RADAR.y}px`, transformBox: 'view-box' }}
      >
        <path
          d={`M${RADAR.x} ${RADAR.y} L${RADAR.x + 66} ${RADAR.y} A66 66 0 0 0 ${RADAR.x + 46.7} ${RADAR.y - 46.7} Z`}
          fill="url(#sweep-fade)"
          stroke="none"
        />
      </g>
      <circle cx={RADAR.x + 30} cy={RADAR.y - 34} r={4} fill={RADAR_GREEN} />
      <circle cx={RADAR.x - 40} cy={RADAR.y + 18} r={3.5} fill={RADAR_GREEN} />
    </g>
  )
}

export function HomeBanner() {
  return (
    <section className="tricolour-band flex flex-col items-center gap-3 rounded-lg border border-slate-200 px-4 py-4 sm:flex-row sm:gap-6 sm:px-6">
      <svg
        viewBox="20 6 290 148"
        className="h-24 w-auto shrink-0 sm:h-32"
        aria-hidden="true"
        focusable="false"
        data-testid="banner-art"
      >
        <Quadcopter />
        <Radar />
      </svg>
      <p className="text-center text-lg font-semibold text-navy-900 sm:text-left sm:text-xl">{TAGLINE}</p>
    </section>
  )
}
