import type { Leaderboard } from '@sports/scoring';
import { Avatar } from '@/components/ratch/avatar';
import '@/components/sports/sports.css';

/** The tournament's leaderboards. Each card says how it is ranked, and equal players share a place. */
export function Leaderboards({ boards, avatars }: { boards: Leaderboard[]; avatars?: Record<string, string | null> }) {
  const any = boards.some((b) => b.rows.length > 0);
  return (
    <>
      {!any && <p className="sh-muted" style={{ padding: '0 4px 12px' }}>Nothing yet. Leaders appear once matches are scored.</p>}
      <div className="tn-leaders">
        {boards.map((b) => (
          <section key={b.key} className="sh-card" aria-label={b.title}>
            <div className="lbl">{b.title}</div>
            <p className="tn-rule">Ranked by: {b.rule}.</p>
            {b.rows.length === 0 ? (
              <p className="sh-muted">No one yet.</p>
            ) : (
              <ol className="sh-leaders">
                {b.rows.map((r) => (
                  <li key={r.playerId} data-first={r.rank === 1 ? 'true' : undefined}>
                    <span className="sh-rank" title={r.tied ? 'Level with another player on every rule' : undefined}>{r.tied ? `${r.rank}=` : r.rank}</span>
                    <Avatar name={r.name} size={28} src={avatars?.[r.playerId]} />
                    <span className="sh-who">
                      <b>{r.name}</b>
                      <small>{r.detail}</small>
                      <i style={{ width: `${Math.round(r.bar * 100)}%` }} />
                    </span>
                    <span className="sh-val">{r.value}</span>
                  </li>
                ))}
              </ol>
            )}
            {b.note && <p className="tn-note">{b.note}</p>}
          </section>
        ))}
      </div>
    </>
  );
}
