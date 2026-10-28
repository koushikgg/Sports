import { cn } from '@/lib/utils';

const field = 'w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm';

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface p-4', className)} {...p} />;
}

export function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted">{text}</span>
      {children}
    </label>
  );
}

export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={cn(field, p.className)} />
);
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cn(field, p.className)} />
);
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cn(field, p.className)} />
);

export function Button({
  variant = 'primary',
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  return (
    <button
      {...p}
      className={cn(
        'rounded-md px-3 py-2 text-sm font-medium',
        variant === 'primary' && 'bg-brand text-black',
        variant === 'ghost' && 'border border-border text-fg hover:bg-surface-2',
        variant === 'danger' && 'border border-live/50 text-live hover:bg-live/10',
        className,
      )}
    />
  );
}

export function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'live' ? 'bg-live/15 text-live' : status === 'completed' ? 'bg-success/15 text-success' : 'bg-surface-2 text-muted';
  return <span className={cn('rounded-full px-2 py-0.5 text-xs capitalize', color)}>{status}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">{children}</p>;
}
