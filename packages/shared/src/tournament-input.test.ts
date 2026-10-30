import { describe, expect, it } from 'vitest';
import { tournamentEditSchema, tournamentInputSchema } from './index';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = {
  name: 'City Cup', sportId: id(1), startDate: '2026-11-01', endDate: '2026-11-20', formatKey: 'lk' as const, overs: 10,
  points: { win: 2, tie: 1, noResult: 1 }, qualify: 4 as const, tiebreak: 'NRR' as const, teamIds: [id(2), id(3), id(4), id(5)],
  schedule: { perDay: 2, firstMatchTime: '18:00', restDay: false }, tzOffset: -330,
};

describe('a tournament does not need a venue', () => {
  it('can be created with no venues at all, or with the field left out', () => {
    expect(tournamentInputSchema.safeParse({ ...base, venueIds: [] }).success).toBe(true);
    const r = tournamentInputSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.venueIds).toEqual([]);
  });
  it('still accepts venues, and rejects something that is not a venue id', () => {
    expect(tournamentInputSchema.safeParse({ ...base, venueIds: [id(9)] }).success).toBe(true);
    expect(tournamentInputSchema.safeParse({ ...base, venueIds: ['not-an-id'] }).success).toBe(false);
  });
  it('can be edited down to no venues', () => {
    const edit = { tournamentId: id(7), name: base.name, startDate: base.startDate, endDate: base.endDate, formatKey: base.formatKey, overs: 10, points: base.points, qualify: 4 as const, tiebreak: base.tiebreak, schedule: base.schedule, tzOffset: -330 };
    expect(tournamentEditSchema.safeParse({ ...edit, venueIds: [] }).success).toBe(true);
    expect(tournamentEditSchema.safeParse(edit).success).toBe(true);
  });
  it('other rules are unchanged', () => {
    expect(tournamentInputSchema.safeParse({ ...base, name: '' }).success).toBe(false);
    expect(tournamentInputSchema.safeParse({ ...base, endDate: '2026-10-01' }).success).toBe(false);
    expect(tournamentInputSchema.safeParse({ ...base, teamIds: [id(2), id(3)] }).success).toBe(false);
  });
});
