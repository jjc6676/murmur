// Murmur wordmark: soundwave bars + name.
export function Logo({ size = 22 }: { size?: number }) {
  const bars = [0.45, 0.8, 1, 0.65, 0.9];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
        {bars.map((h, i) => (
          <rect key={i} x={1 + i * 4.2} y={11 - (h * 18) / 2} width={2.6} height={h * 18} rx={1.3} fill="currentColor" />
        ))}
      </svg>
      <span style={{ fontWeight: 650, fontSize: size * 0.95, letterSpacing: '-0.02em' }}>Murmur</span>
    </span>
  );
}
