import type { BatterStat, Chip, Innings } from '@sports/sports-engine/src/cricket';
import { cn } from '@/lib/utils';

export type Names = Record<string, string>;

export const nameOf = (names: Names, id: string | null | undefined) => (id ? (names[id] ?? '?') : '');

export function howOut(b: BatterStat, names: Names, innings: Innings): string {
  const o = b.out;
  if (!o) return innings.striker === b.id || innings.nonStriker === b.id ? 'batting' : 'not out';
  const bowler = nameOf(names, o.bowlerId);
  const fielder = nameOf(names, o.fielderId);
  switch (o.kind) {
    case 'bowled': return `b ${bowler}`;
    case 'caught': return fielder && o.fielderId === o.bowlerId ? `c & b ${bowler}` : `c ${fielder || '?'} b ${bowler}`;
    case 'lbw': return `lbw b ${bowler}`;
    case 'stumped': return `st ${fielder || '?'} b ${bowler}`;
    case 'hit_wicket': return `hit wicket b ${bowler}`;
    case 'run_out': return fielder ? `run out (${fielder})` : 'run out';
    case 'retired_hurt': return 'retired hurt';
    case 'retired_out': return 'retired out';
  }
}

const chipTone: Record<Chip['kind'], string> = {
  dot: 'bg-surface-2 text-muted',
  run: 'bg-white text-black',
  four: 'bg-accent text-white',
  six: 'bg-purple-500 text-white',
  wicket: 'bg-live text-white',
  extra: 'bg-brand text-black',
};

export function ChipStrip({ chips, className, size = 'md' }: { chips: Chip[]; className?: string; size?: 'md' | 'lg' }) {
  if (chips.length === 0) return <div className={cn('text-muted', size === 'lg' ? 'h-16 text-xl' : 'h-9 text-xs', className)}>New over</div>;
  return (
    <div className={cn('flex flex-wrap', size === 'lg' ? 'gap-3' : 'gap-2', className)}>
      {chips.map((c, i) => (
        <span
          key={i}
          className={cn('flex items-center justify-center rounded-full px-2 font-semibold', size === 'lg' ? 'h-16 min-w-16 text-2xl' : 'h-9 min-w-9 text-sm', chipTone[c.kind])}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}
