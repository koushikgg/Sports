import { teamTint } from '@/components/matches/model';

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

/** Round badge: the person's photo when they have one, otherwise initials tinted from the name. */
export function Avatar({ name, size = 32, src }: { name: string; size?: number; src?: string | null }) {
  const t = teamTint(name);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" aria-hidden className="rx-ava" style={{ width: size, height: size, objectFit: 'cover' }} />;
  }
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
