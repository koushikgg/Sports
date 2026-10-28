'use client';
import { useState } from 'react';
import type { MatchSnapshot } from '@sports/shared';
import { Button, Card, Input, Label, Textarea } from '@/components/ui';
import { useScorer } from '@/lib/use-live-match';

/** Sport-agnostic console for exercising the realtime pipeline. */
export function ScorerDebug({ initial }: { initial: MatchSnapshot }) {
  const { snapshot, connected, send, release, error, busy } = useScorer(initial);
  const [type, setType] = useState('');
  const [payload, setPayload] = useState('{}');
  const [parseError, setParseError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setParseError(null);
      await send(type, JSON.parse(payload || '{}'));
    } catch {
      setParseError('Payload is not valid JSON');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm text-muted">
        <span>{connected ? '● connected' : '○ connecting…'}</span>
        <span>seq {snapshot.seq}</span>
        <span className="capitalize">{snapshot.status}</span>
      </div>
      <Card>
        {snapshot.summary.sides.map((s) => (
          <div key={s.name} className="flex justify-between"><span>{s.name}</span><span className="font-mono">{s.score}</span></div>
        ))}
        <p className="mt-2 text-xs text-muted">{snapshot.summary.status}</p>
      </Card>
      <Card>
        <form onSubmit={submit} className="space-y-3">
          <Label text="Event type"><Input value={type} onChange={(e) => setType(e.target.value)} required /></Label>
          <Label text="Payload (JSON)"><Textarea rows={3} value={payload} onChange={(e) => setPayload(e.target.value)} /></Label>
          {(error || parseError) && <p className="text-sm text-live">{error ?? parseError}</p>}
          <div className="flex gap-2">
            <Button disabled={busy}>Send</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => send('undo')}>Undo</Button>
            <Button type="button" variant="ghost" onClick={release}>Release lock</Button>
          </div>
        </form>
      </Card>
      <details className="text-xs text-muted">
        <summary>Raw state</summary>
        <pre className="mt-2 overflow-auto rounded-lg bg-surface-2 p-3">{JSON.stringify(snapshot.state, null, 2)}</pre>
      </details>
    </div>
  );
}
