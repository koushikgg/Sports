'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { regenerateTableFixtures } from '@/app/tournaments/[id]/fixtures-actions';
import '@/components/teams/team-manage.css';
import { toast } from '@/components/ratch/toast';

/** Admin note on a Table tournament's Fixtures tab: the fixtures make themselves, and can be made again until play starts. */
export function TableFixturesPanel({ tournamentId, teamCount, qualify, matchesPerTeam, fixtureCount, started }: { tournamentId: string; teamCount: number; qualify: 2 | 4; matchesPerTeam?: number; fixtureCount: number; started: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      const r = await regenerateTableFixtures({ tournamentId, tzOffset: new Date().getTimezoneOffset() });
      if (r.error) toast.error(r.error);
      else { toast.success('Fixtures made again.'); router.refresh(); }
    } catch { toast.error('Something went wrong. Try again.'); } finally { setBusy(false); }
  };

  const each = matchesPerTeam ?? teamCount - 1;
  const league = (teamCount * each) / 2;
  return (
    <div className="tm-panel" style={{ marginBottom: 16 }}>
      <span className="lbl">TABLE · FIXTURES ARE MADE FOR YOU</span>
      <span className="tm-note">
        {matchesPerTeam ? `Each team plays ${matchesPerTeam} of the other ${teamCount - 1} (${league} league matches)` : `Every team plays every other team once (${league} matches)`}, then {qualify === 4 ? 'the top 4 play semi-finals (1st v 4th, 2nd v 3rd) and a final' : 'the top 2 play the final'}. The knockout sides fill in when the league is done.
        {started ? ' The tournament has started, so the fixtures are locked.' : ' They are made again whenever you change the teams or edit the tournament, until it starts.'}
      </span>
      {!started && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="tm-btn" disabled={busy} onClick={() => (fixtureCount > 0 ? setAsk(true) : void go())}>{busy ? 'MAKING…' : fixtureCount > 0 ? 'MAKE THE FIXTURES AGAIN' : 'MAKE THE FIXTURES'}</button>
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
