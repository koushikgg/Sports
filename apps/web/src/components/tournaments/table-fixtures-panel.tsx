'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { regenerateTableFixtures } from '@/app/tournaments/[id]/fixtures-actions';
import '@/components/teams/team-manage.css';

/** Admin note on a Table tournament's Fixtures tab: the fixtures make themselves, and can be made again until play starts. */
export function TableFixturesPanel({ tournamentId, teamCount, qualify, fixtureCount, started }: { tournamentId: string; teamCount: number; qualify: 2 | 4; fixtureCount: number; started: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  const go = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await regenerateTableFixtures({ tournamentId, tzOffset: new Date().getTimezoneOffset() });
      if (r.error) setMsg({ text: r.error, bad: true });
      else { setMsg({ text: 'Fixtures made again.' }); router.refresh(); }
    } catch { setMsg({ text: 'Something went wrong. Try again.', bad: true }); } finally { setBusy(false); }
  };

  const league = (teamCount * (teamCount - 1)) / 2;
  return (
    <div className="tm-panel" style={{ marginBottom: 16 }}>
      <span className="lbl">TABLE · FIXTURES ARE MADE FOR YOU</span>
      <span className="tm-note">
        Every team plays every other team once ({league} matches), then {qualify === 4 ? 'the top 4 play semi-finals (1st v 4th, 2nd v 3rd) and a final' : 'the top 2 play the final'}. The knockout sides fill in when the league is done.
        {started ? ' The tournament has started, so the fixtures are locked.' : ' They are made again whenever you change the teams or edit the tournament, until it starts.'}
      </span>
      {!started && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="tm-btn" disabled={busy} onClick={() => (fixtureCount > 0 ? setAsk(true) : void go())}>{busy ? 'MAKING…' : fixtureCount > 0 ? 'MAKE THE FIXTURES AGAIN' : 'MAKE THE FIXTURES'}</button>
          {msg && <span role="status" style={{ fontSize: 13, color: msg.bad ? 'var(--red-text)' : 'var(--text-secondary)' }}>{msg.text}</span>}
        </div>
      )}
      {ask && (
        <div className="tm-modal" onClick={() => setAsk(false)}>
          <div className="tm-dialog" role="alertdialog" aria-label="Make the fixtures again?" onClick={(e) => e.stopPropagation()}>
            <h2>Make the fixtures again?</h2>
            <p>The {fixtureCount} current fixtures are replaced by a fresh set from the teams and settings. Nothing has been played yet, so only the schedule changes.</p>
            <div className="tm-acts">
              <button type="button" className="tm-btn" onClick={() => setAsk(false)}>CANCEL</button>
              <button type="button" className="tm-btn" data-v="danger" onClick={() => { setAsk(false); void go(); }}>MAKE AGAIN</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
