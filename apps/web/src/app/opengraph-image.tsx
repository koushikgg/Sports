import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Ratchet — every match, live';

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#0b0f14', color: '#e8edf3', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', fontSize: 120, fontWeight: 800 }}>
          Sports <span style={{ color: '#f59e0b', marginLeft: 24 }}>Hub</span>
        </div>
        <div style={{ fontSize: 44, color: '#8b98a9' }}>Every match. Live.</div>
      </div>
    ),
    size,
  );
}
