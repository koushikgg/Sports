'use client';
import { useEffect, useState } from 'react';

/** Renders in the viewer's timezone. The server cannot know it, so it renders after mount. */
export function LocalTime({ iso, fallback = 'Time TBD' }: { iso: string | null; fallback?: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!iso) return;
    setText(
      new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)),
    );
  }, [iso]);
  if (!iso) return <>{fallback}</>;
  return <time dateTime={iso}>{text ?? ' '}</time>;
}
