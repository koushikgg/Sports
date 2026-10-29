import { cn } from '@/lib/utils';

/* Shared controls for the admin and forms. Ratch look: soft cards, pill buttons, mono labels, no strokes. */
const field =
  'w-full rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-fg outline-none focus:outline-none focus-visible:outline-none placeholder:text-muted/70';

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <h1 className="font-display text-4xl font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl bg-surface p-5', className)} {...p} />;
}

export function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">{text}</span>
      {children}
    </label>
  );
}

export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(field, p.className)} />;
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cn(field, p.className)} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cn(field, p.className)} />;

export function Button({
  variant = 'primary',
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  return (
    <button
      {...p}
      className={cn(
        'rounded-full px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] transition hover:brightness-110 active:scale-[0.97] disabled:opacity-45',
        variant === 'primary' && 'bg-brand text-black',
        variant === 'ghost' && 'bg-surface-2 text-fg',
        variant === 'danger' && 'bg-live/15 text-live',
        className,
      )}
    />
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'live' ? 'bg-live/15 text-live' : status === 'completed' ? 'bg-success/15 text-success' : status === 'scheduled' ? 'bg-brand/12 text-brand' : 'bg-surface-2 text-muted';
  return <span className={cn('rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em]', tone)}>{status}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-surface p-8 text-center text-sm text-muted">{children}</p>;
}
