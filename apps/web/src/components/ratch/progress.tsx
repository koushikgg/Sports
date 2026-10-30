'use client';
import { useEffect, useState } from 'react';
import './progress.css';

/**
 * Shows work in progress everywhere. A bar runs along the top while a page change or a server action is in flight, and
 * the button that started an action shows a spinner and ignores clicks until it is done. It watches `fetch`, which is
 * how Next sends both, so no page needs its own wiring. Plain form posts (a full page load) show the bar until the
 * new page arrives. Mount once per page.
 */
const SHOW_AFTER_MS = 150;

function headerOf(input: RequestInfo | URL, init: RequestInit | undefined, name: string): string | null {
  const h = init?.headers ?? (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
  if (!h) return null;
  if (h instanceof Headers) return h.get(name);
  if (Array.isArray(h)) return h.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ?? null;
  const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? String((h as Record<string, string>)[key]) : null;
}

export function Progress() {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let inflight = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      if (inflight > 0) timer = setTimeout(() => setBusy(true), SHOW_AFTER_MS);
      else setBusy(false);
    };

    let lastButton: { el: HTMLButtonElement; at: number } | null = null;
    const onClick = (e: MouseEvent) => {
      const b = (e.target as Element | null)?.closest?.('button');
      if (b) lastButton = { el: b, at: Date.now() };
    };
    document.addEventListener('click', onClick, true);

    const original = window.fetch;
    window.fetch = function patched(input, init) {
      const method = (init?.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
      const isAction = headerOf(input, init, 'next-action') !== null;
      const isNav = headerOf(input, init, 'rsc') !== null && headerOf(input, init, 'next-router-prefetch') === null;
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const isWrite = method !== 'GET' && method !== 'HEAD' && url.includes('/api/');
      if (!isAction && !isNav && !isWrite) return original.call(this, input, init);

      inflight++;
      update();
      let btn: HTMLButtonElement | null = null;
      if (isAction || isWrite) {
        const active = document.activeElement;
        btn = lastButton && Date.now() - lastButton.at < 600 ? lastButton.el : active instanceof HTMLButtonElement ? active : null;
        if (btn?.isConnected) { btn.dataset.pending = 'true'; btn.setAttribute('aria-busy', 'true'); } else btn = null;
      }
      const done = () => {
        inflight = Math.max(0, inflight - 1);
        update();
        if (btn) { delete btn.dataset.pending; btn.removeAttribute('aria-busy'); }
      };
      return original.call(this, input, init).finally(done);
    };

    // a form that posts and loads a whole new page
    const onSubmit = (e: Event) => {
      setTimeout(() => {
        if (e.defaultPrevented) return;
        inflight++;
        update();
        const f = e.target as HTMLFormElement;
        const b = ((e as SubmitEvent).submitter as HTMLButtonElement | null) ?? f.querySelector<HTMLButtonElement>('button[type=submit], button:not([type])');
        if (b) b.dataset.pending = 'true';
      }, 0);
    };
    document.addEventListener('submit', onSubmit);
    const onShow = () => { inflight = 0; update(); document.querySelectorAll('[data-pending]').forEach((x) => delete (x as HTMLElement).dataset.pending); };
    window.addEventListener('pageshow', onShow);

    return () => {
      window.fetch = original;
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit);
      window.removeEventListener('pageshow', onShow);
      clearTimeout(timer);
    };
  }, []);

  return <div className="rp-bar" data-on={busy ? 'true' : undefined} role="progressbar" aria-hidden={!busy} aria-label="Working" />;
}
