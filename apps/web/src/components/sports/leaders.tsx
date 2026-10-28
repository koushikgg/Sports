import type { Leader } from '@sports/scoring';
import { Avatar } from '@/components/ratch/avatar';

/** Ranked rows with a bar showing each value against the leader. */
export function LeaderBoard({ title, unit, rows }: { title: string; unit: string; rows: Leader[] }) {
  const top = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="sh-card" aria-label={title}>
      <div className="lbl">{title}</div>
      {rows.length === 0 ? (
        <p className="sh-muted">Nothing yet. Leaders appear once matches are scored.</p>
      ) : (
        <ol className="sh-leaders">
          {rows.map((r, i) => (
            <li key={r.playerId} data-first={i === 0 ? 'true' : undefined}>
              <span className="sh-rank">{i + 1}</span>
              <Avatar name={r.name} size={28} />
              <span className="sh-who">
                <b>{r.name}</b>
                <small>{r.detail}</small>
                <i style={{ width: `${(r.value / top) * 100}%` }} />
              </span>
              <span className="sh-val">{r.value}<small>{unit}</small></span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
