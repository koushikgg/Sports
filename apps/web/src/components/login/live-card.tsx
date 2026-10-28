'use client';
import { useEffect, useState } from 'react';

export interface FeedItem { comp: string; match: string; score: string; line: string; live: boolean }

/** A card on the brand panel that rotates through what is on right now (or coming up next). */
export function LiveCard({ items }: { items: FeedItem[] }) {
  const [i, setI] = useState(0);
  const [out, setOut] = useState(false);

  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => {
      setOut(true);
      setTimeout(() => { setI((n) => (n + 1) % items.length); setOut(false); }, 350);
    }, 4000);
    return () => clearInterval(t);
  }, [items.length]);

  const item = items[i];
  if (!item) return null;
  return (
    <div className="lg-card" data-out={out ? 'true' : undefined} aria-live="polite">
      <div className="lg-card-row">
        <span className="lbl">{item.comp}</span>
        <span className="mx-badge" data-tone={item.live ? 'live' : 'up'}><i />{item.live ? 'LIVE' : 'NEXT'}</span>
      </div>
      <div className="lg-card-row lg-base">
        <span className="lg-card-match">{item.match}</span>
        <span className="lg-card-score">{item.score}</span>
      </div>
      <span className="lg-card-line">{item.line}</span>
    </div>
  );
}
