import { ImageResponse } from 'next/og';
import { getMatchCard } from '@/lib/queries';

/** The share card for a match, used by both match routes. */
const size = { width: 1200, height: 630 };

export async function matchImage(id: string) {
  const m = await getMatchCard(id);
  const live = m?.status === 'live';

  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#0b0f14', color: '#e8edf3', padding: 64, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 32, color: '#8b98a9' }}>
          <span style={{ color: '#f59e0b', fontWeight: 700 }}>Ratchet</span>
          <span>{m?.sportName}</span>
          {live && <span style={{ background: '#ef4444', color: 'white', padding: '4px 16px', borderRadius: 999, fontSize: 26 }}>LIVE</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {(m ? m.summary.sides : []).map((s) => (
            <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 72, fontWeight: 700 }}>
              <span>{s.name}</span>
              <span style={{ color: '#f59e0b' }}>{s.score}</span>
            </div>
          ))}
          {!m && <div style={{ fontSize: 64 }}>Match not found</div>}
        </div>
        <div style={{ fontSize: 36, color: '#8b98a9' }}>{m?.summary.status}</div>
      </div>
    ),
    size,
  );
}
