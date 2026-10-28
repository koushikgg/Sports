import { chipText } from '@sports/sports-engine/src/cricket-view';
import type { Chip as ChipData } from '@sports/sports-engine/src/cricket';

/** A ball chip. Styles live in styles/ratch-base.css (.sc-chip). */
export function Chip({ chip, size, pop }: { chip: ChipData | null; size?: 'sm' | 'md' | 'lg'; pop?: boolean }) {
  if (!chip) return <span className="sc-chip" data-kind="empty" data-size={size} aria-hidden />;
  return (
    <span className="sc-chip" data-kind={chip.kind} data-size={size} data-pop={pop ? 'true' : undefined}>
      {chipText(chip)}
    </span>
  );
}
