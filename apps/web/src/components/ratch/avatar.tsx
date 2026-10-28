import { teamTint } from '@/components/matches/model';

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

/** Round initials badge, tinted from the name so a person always looks the same. */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const t = teamTint(name);
  return (
    <span
      aria-hidden
      className="rx-ava"
      style={{ width: size, height: size, background: t.bg, color: t.fg, fontSize: Math.max(9, Math.round(size * 0.34)) }}
    >
      {initials(name)}
    </span>
  );
}
