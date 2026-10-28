import type { Leader } from '@sports/scoring';
import { Card } from '@/components/ui';

function Board({ title, unit, rows }: { title: string; unit: string; rows: Leader[] }) {
  return (
    <Card>
      <h3 className="mb-3 font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.playerId} className="flex items-center gap-3 text-sm">
              <span className="w-5 text-muted tabular-nums">{i + 1}</span>
              <span className="flex-1">
                <span className="font-medium">{r.name}</span>
                <span className="block text-xs text-muted">{r.detail}</span>
              </span>
              <span className="font-mono text-lg tabular-nums">{r.value}<span className="ml-1 text-xs text-muted">{unit}</span></span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function CricketLeaders({ runs, wickets }: { runs: Leader[]; wickets: Leader[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Board title="Top run-scorers" unit="runs" rows={runs} />
      <Board title="Top wicket-takers" unit="wkts" rows={wickets} />
    </div>
  );
}
