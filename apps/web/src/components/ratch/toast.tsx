'use client';
import { useSyncExternalStore } from 'react';
import './toast.css';

type Kind = 'error' | 'success';
interface Item { id: number; kind: Kind; text: string }

/**
 * App-wide toasts. Call `toast.error(...)` or `toast.success(...)` from anywhere on the client; one `<Toaster />` on the
 * page shows them. Errors stay longer than successes and can be closed. The same message sent twice within a second
 * shows once, so a double click does not stack copies.
 */
let items: Item[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const MAX = 4;
const LIFE: Record<Kind, number> = { success: 2800, error: 7000 };

function dismiss(id: number) {
  const next = items.filter((i) => i.id !== id);
  if (next.length !== items.length) { items = next; emit(); }
}

function push(kind: Kind, text: string) {
  const t = text.trim();
  if (!t) return;
  const dupe = items.find((i) => i.kind === kind && i.text === t);
  if (dupe) { setTimeout(() => dismiss(dupe.id), LIFE[kind]); return; }
  const id = ++seq;
  items = [...items, { id, kind, text: t }].slice(-MAX);
  emit();
  setTimeout(() => dismiss(id), LIFE[kind]);
}

export const toast = {
  error: (text: string) => push('error', text),
  success: (text: string) => push('success', text),
};

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => items;
const server: Item[] = [];

/** Mount once per page. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot, () => server);
  return (
    <div className="rx-toasts" aria-live="polite" aria-atomic="false">
      {list.map((t) => (
        <div key={t.id} className="rx-toast" data-kind={t.kind} role={t.kind === 'error' ? 'alert' : 'status'}>
          <i aria-hidden />
          <span>{t.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
