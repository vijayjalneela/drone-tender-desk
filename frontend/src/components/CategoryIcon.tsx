import type { Category } from '../api/types'

// Small decorative icons beside the category name (frontend-spec §7.1). Inline SVG,
// drawn in the surrounding text colour. The name itself always stays as text.

function DroneIcon() {
  // Top-down quadcopter: four rotor rings at the corners, short arms, a solid body.
  const rotors = [
    [6, 6],
    [18, 6],
    [6, 18],
    [18, 18],
  ]
  return (
    <>
      <path d="M8.5 8.5 L10.5 10.5 M15.5 8.5 L13.5 10.5 M8.5 15.5 L10.5 13.5 M15.5 15.5 L13.5 13.5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      {rotors.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={3.6} fill="none" stroke="currentColor" strokeWidth={1.8} />
      ))}
      <rect x={9.5} y={9.5} width={5} height={5} rx={1.2} fill="currentColor" />
    </>
  )
}

function RadarShieldIcon() {
  // A shield with two radar arcs and a blip inside: arcs only, no spokes.
  return (
    <>
      <path d="M12 2.5 L20 5.5 V11.5 C20 16.5 16.6 20 12 21.5 C7.4 20 4 16.5 4 11.5 V5.5 Z" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
      <path d="M8.5 14 A4 4 0 0 1 15.5 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M6.8 11.5 A6.2 6.2 0 0 1 17.2 11.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" opacity={0.7} />
      <circle cx={12} cy={15.5} r={1.4} fill="currentColor" />
    </>
  )
}

export function CategoryIcon({ category, className = 'h-4 w-4' }: { category: Category | null; className?: string }) {
  if (!category) return null
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
      data-icon={category === 'drone' ? 'drone' : 'counter-drone'}
    >
      {category === 'drone' ? <DroneIcon /> : <RadarShieldIcon />}
    </svg>
  )
}
