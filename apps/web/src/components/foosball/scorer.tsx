'use client';
import '@fontsource-variable/inter';
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/jetbrains-mono';
import '@/components/cricket/ratch.css';
import './foosball.css';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchSnapshot } from '@sports/shared';
import { currentGame, gamesToWin, playerGoals, type FoosballState, type Side } from '@sports/sports-engine/src/foosball';
import { setFoosballLineup } from '@/app/foosball-actions';
import { toast, Toaster } from '@/components/ratch/toast';
import { ArrowLeft, Check, Close, Undo } from '@/components/ratch/icons';
import { useScorer } from '@/lib/use-live-match';

const on = (v: boolean) => (v ? 'true' : 'false');

/** Foosball scorer console: tap a side's panel when it scores. Undo takes the last goal back. */
export function FoosballScorer({ initial, venue, backHref }: { initial: MatchSnapshot; venue?: string | null; backHref: string }) {
  const { snapshot, connected, send, release, error, busy } = useScorer(initial);
  const s = snapshot.state as FoosballState;
  const g = currentGame(s);
  const [sheet, setSheet] = useState(false);
  const [res, setRes] = useState<'a' | 'b' | 'nr'>('a');
  const [ack, setAck] = useState(false);
  // self-goal mode: the next tap names the player who put it into their own goal
  const [own, setOwn] = useState(false);
  // starting: the console opens as normal and shows a card; the player picker only opens when asked, and can be cancelled
  const [started, setStarted] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [pick, setPick] = useState<{ a: string[]; b: string[] }>({ a: [], b: [] });
  const [lineup, setLineup] = useState<{ a: string[]; b: string[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const everConnected = useRef(false);
  if (connected) everConnected.current = true;
  const conn = connected ? 'live' : everConnected.current ? 'off' : 'wait';
  useEffect(() => { if (error) toast.error(error); }, [error]);
  useEffect(() => { if (!s.result) setAck(false); }, [s.result]);

  const rawRoster = (teamId: string) => snapshot.roster.find((t) => t.id === teamId)?.players ?? [];
  const untouched = snapshot.seq === 0 && !s.result && s.games.length === 1 && s.games[0]!.a + s.games[0]!.b === 0;
  // the match says whether it is singles (1 a side) or doubles (2); matches made before that was a setting take up to two
  const perSide = s.playersPerSide ?? null;
  const fits = (teamId: string) => Math.min(perSide ?? 2, rawRoster(teamId).length);
  const limitOf = (teamId: string) => perSide ?? 2;
  const needsPick = s.teams.some((t) => rawRoster(t.id).length > limitOf(t.id)) && !lineup;
  const emptyTeams = s.requirePlayers !== false ? s.teams.filter((t) => rawRoster(t.id).length < (perSide ?? 1)) : [];
  const setupNeeded = untouched && !started;
  const canScore = connected && !s.result && !setupNeeded;
  const canUndo = connected && !!s.lastAction && !busy;
  const run = useCallback(async (type: string, payload: Record<string, unknown>, message?: string) => {
    const ok = await send(type, payload);
    if (ok && message) toast.success(message);
    return ok;
  }, [send]);
  const goal = (side: Side) => { if (canScore) void run('goal', { side }); };
  /** A named scorer. In self-goal mode the player is the one who scored against their own side, so the point goes to the other. */
  const goalBy = (team: Side, playerId: string, who: string) => {
    if (!canScore) return;
    const other: Side = team === 'a' ? 'b' : 'a';
    if (own) void run('goal', { side: other, playerId, own: true }, `Self goal by ${who}. Point to ${s.teams[other === 'a' ? 0 : 1]!.name}`).then(() => setOwn(false));
    else void run('goal', { side: team, playerId });
  };
  // before the match starts a team with more than two players shows none: they are chosen first
  const roster = (team: { id: string }, k: Side) => {
    const all = rawRoster(team.id);
    if (lineup) return all.filter((x) => lineup[k].includes(x.id));
    return setupNeeded && all.length > limitOf(team.id) ? [] : all;
  };
  const per = playerGoals(s);
  const undo = () => { if (canUndo) void run('undo', {}, `${s.lastAction!.label.toLowerCase()} removed`); };

  const keys = useRef<(e: KeyboardEvent) => void>(undefined);
  keys.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || sheet || pickOpen) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'arrowleft') { e.preventDefault(); goal('a'); }
    else if (k === 'b' || k === 'arrowright') { e.preventDefault(); goal('b'); }
    else if (k === 'o') { e.preventDefault(); if (canScore) setOwn((v) => !v); }
    else if (k === 'u') { e.preventDefault(); undo(); }
    else if (k === 'escape') { setSheet(false); setPickOpen(false); }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current?.(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const winsNeeded = gamesToWin(s.bestOf);
  const sides: { k: Side; team: { id: string; name: string } }[] = [{ k: 'a', team: s.teams[0]! }, { k: 'b', team: s.teams[1]! }];
  const undoTitle = !s.lastAction ? 'NOTHING TO UNDO' : `UNDO ${s.lastAction.label}`;
  const undoNote = !s.lastAction ? 'Nothing has been scored yet' : `Removes: ${s.lastAction.label.toLowerCase()}`;
  const status = snapshot.summary.status;
  const showFinal = !!s.result && !ack;

  // ---- starting the match
  const need = fits;
  const pickReady = pick.a.length === need(s.teams[0]!.id) && pick.b.length === need(s.teams[1]!.id);
  // a team with two players or fewer plays them all, so they start picked
  const auto = (teamId: string) => (rawRoster(teamId).length <= limitOf(teamId) ? rawRoster(teamId).map((x) => x.id) : []);
  const openPick = () => { setPick({ a: auto(s.teams[0]!.id), b: auto(s.teams[1]!.id) }); setPickOpen(true); };
  const toggle = (k: Side, id: string) => setPick((p) => {
    const cur = p[k];
    const limit = need(s.teams[k === 'a' ? 0 : 1]!.id);
    return { ...p, [k]: cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= limit ? [...cur.slice(1), id] : [...cur, id] };
  });
  const startMatch = async () => {
    setSaving(true);
    try {
      const r = await setFoosballLineup({ matchId: snapshot.matchId, a: pick.a, b: pick.b });
      if (r.error) return void toast.error(r.error);
      setLineup(pick); setStarted(true); setPickOpen(false);
      toast.success('Players set. Ready to score.');
    } catch { toast.error('Something went wrong. Try again.'); } finally { setSaving(false); }
  };
  const names = (k: Side) => rawRoster(s.teams[k === 'a' ? 0 : 1]!.id).map((x) => x.name).join(' & ');

  const publish = () => {
    const body = res === 'nr' ? { outcome: 'no_result' } : { outcome: 'win', winnerTeamId: res === 'a' ? s.teams[0]!.id : s.teams[1]!.id };
    void run('finish', body, 'Result published to live view').then((ok) => { if (ok) setSheet(false); });
  };

  return (
    <div className="ratch sc-root fb-root" data-theme="dark">
      <div className="sc-top">
        <div className="sc-brand">
          <Link href={backHref} aria-label="Back to match" className="sc-back"><ArrowLeft size={28} /></Link>
          <span className="sc-brand-dot" />
          <span className="sc-brand-name">Ratchet</span>
          <span className="sc-tag">SCORER</span>
        </div>
        <Link href="/matches" className="sc-allmatches">ALL MATCHES</Link>
        <div className="sc-matchmeta">
          <b>{s.teams.map((t) => t.name).join(' vs ')}</b>
          <span className="lbl" style={{ letterSpacing: '0.04em' }}>
            FOOSBALL{perSide ? (perSide === 2 ? ' DOUBLES' : ' SINGLES') : ''} · {s.bestOf === 1 ? 'SINGLE GAME' : `BEST OF ${s.bestOf}`} TO {s.firstTo}{s.winBy === 2 ? ', WIN BY 2' : ''}{venue ? ` · ${venue.toUpperCase()}` : ''}
          </span>
        </div>
        <div className="sc-conn" data-state={conn} role="status">
          <i />
          {conn === 'live' ? (busy ? 'SAVING…' : 'LIVE · SYNCED') : conn === 'off' ? 'OFFLINE' : 'CONNECTING'}
        </div>
      </div>

      {conn === 'off' && (
        <div className="sc-banner" role="alert">
          <span>Offline. Scoring is paused until the connection returns. Nothing is saved on this device.</span>
          <span className="mono" style={{ fontSize: 11, fontWeight: 700 }}>RECONNECTING</span>
        </div>
      )}

      <div className="sc-body fb-body">
        <div className="sc-main">
          {setupNeeded && (
            <section className="fb-setup" aria-label="Start the match" data-warn={emptyTeams.length ? 'true' : undefined}>
              <div className="fb-setup-text">
                <span className="lbl">{emptyTeams.length ? 'ADD PLAYERS FIRST' : needsPick ? 'CHOOSE WHO PLAYS' : 'READY TO START'}</span>
                {emptyTeams.length > 0 ? (
                  <>
                    <b>{perSide === 2 ? 'This is a doubles match: each team needs 2 players before it can start.' : 'A team needs at least one player before the match can start.'}</b>
                    <p>{emptyTeams.map((t, i) => { const n = rawRoster(t.id).length; return <span key={t.id}>{i > 0 && ' · '}<Link href={`/teams/${t.id}`} target="_blank">{t.name} has {n === 0 ? 'no players' : `${n} player${n === 1 ? '' : 's'}`}. Add {perSide === 2 ? `${2 - n} more` : 'some'}</Link></span>; })}</p>
                  </>
                ) : needsPick ? (
                  <>
                    <b>Pick {perSide === 1 ? 'one player' : 'two players'} for each team.</b>
                    <p>Teams with more than {perSide === 1 ? 'one player' : 'two players'} choose who plays this match.</p>
                  </>
                ) : (
                  <>
                    <b>{names('a')} vs {names('b')}</b>
                    <p>Press start when the teams are ready. Goals can be credited to these players.</p>
                  </>
                )}
              </div>
              <button type="button" className="sc-btn" data-variant="primary" disabled={!connected || emptyTeams.length > 0} onClick={() => (needsPick ? openPick() : setStarted(true))}>
                {needsPick ? 'CHOOSE PLAYERS' : 'START MATCH'}
              </button>
            </section>
          )}
          <div className="fb-status" role="status"><span className="lbl">{s.result ? 'FINAL' : `GAME ${s.games.length}${s.bestOf > 1 ? ` OF ${s.bestOf}` : ''}`}</span><b>{status}</b></div>
          {own && <div className="fb-ownbar" role="status"><b>SELF GOAL</b> Tap the player who put it into their own goal. The point goes to the other team.<button type="button" onClick={() => setOwn(false)}>CANCEL</button></div>}
          <div className="fb-panels">
            {sides.map(({ k, team }) => {
              const won = s.gamesWon[k];
              const people = roster(team, k);
              return (
                <div key={k} className="fb-panel" data-side={k} data-win={on(s.result?.winnerTeamId === team.id)} data-own={on(own)} role="group" aria-label={team.name}>
                  <span className="fb-team">{team.name}</span>
                  <span className="fb-score" aria-live="polite">{g[k]}</span>
                  {s.bestOf > 1 && (
                    <span className="fb-dots" aria-label={`${won} of ${winsNeeded} games`}>
                      {Array.from({ length: winsNeeded }, (_, i) => <i key={i} data-on={on(i < won)} />)}
                      <small>{won} {won === 1 ? 'GAME' : 'GAMES'}</small>
                    </span>
                  )}
                  {people.length > 0 ? (
                    <div className="fb-people">
                      {people.map((pl) => {
                        const st = per[pl.id];
                        return (
                          <button key={pl.id} type="button" className="fb-player" disabled={!canScore} onClick={() => goalBy(k, pl.id, pl.name)} aria-label={own ? `Self goal by ${pl.name}` : `Goal by ${pl.name}`}>
                            <span>{pl.name}</span>
                            <small>{st?.goals ?? 0}{st?.own ? ` · ${st.own} OG` : ''}</small>
                          </button>
                        );
                      })}
                    </div>
                  ) : own ? <span className="fb-nopeople">No players in this team, so a self goal can't be credited to anyone.</span> : null}
                  {!own && (
                    <button type="button" className="fb-tap" disabled={!canScore} onClick={() => goal(k)} aria-label={`Goal for ${team.name}`}>
                      {s.result ? 'MATCH OVER' : people.length ? '+ GOAL · NO SCORER' : '+ GOAL'}<kbd aria-hidden>{k.toUpperCase()}</kbd>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {s.games.some((x) => x.done) && (
            <div className="fb-games" aria-label="Games so far">
              {s.games.filter((x) => x.done).map((x, i) => (
                <span key={i} className="fb-game"><small>GAME {i + 1}</small><b>{x.a}–{x.b}</b><em>{x.winner ? s.teams[x.winner === 'a' ? 0 : 1]!.name : ''}</em></span>
              ))}
            </div>
          )}

          <button type="button" className="sc-undo" disabled={!canUndo} onClick={undo} aria-label={`${undoTitle}. ${undoNote}`}>
            <span className="sc-undo-ico" aria-hidden><Undo size={24} /></span>
            <span className="sc-undo-text"><b>{undoTitle}</b><small>{undoNote}</small></span>
            <kbd aria-hidden>U</kbd>
          </button>
          <div className="sc-pills">
            <button className="sc-pill" aria-pressed={own} data-active={on(own)} disabled={!canScore} onClick={() => setOwn((v) => !v)}>SELF GOAL · O</button>
            <button className="sc-pill" data-tone="danger" disabled={!connected || !!s.result} onClick={() => { setRes('a'); setSheet(true); }}>END MATCH</button>
            <button className="sc-pill" data-solid="card" onClick={() => { release(); toast.success('Scorer lock released'); }}>RELEASE LOCK</button>
          </div>
          <div className="sc-kbd">
            <span className="lbl lbl-sm">KEYBOARD</span>
            <span>A OR ← GOAL FOR {s.teams[0]!.name.toUpperCase()} · B OR → GOAL FOR {s.teams[1]!.name.toUpperCase()} (NO SCORER) · O SELF GOAL · U UNDO · ESC CLOSE</span>
          </div>
        </div>
      </div>

      <Toaster />

      <div className="sc-scrim" data-open={on(pickOpen)} onClick={() => { if (!saving) setPickOpen(false); }}>
        <div className="sc-sheet" role="dialog" aria-modal aria-label="Choose the players" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
          <div className="sc-sheet-head">
            <div>
              <div className="lbl" style={{ color: 'var(--amber)' }}>BEFORE THE MATCH</div>
              <div className="sc-sheet-title">Who plays?</div>
            </div>
            <button className="sc-x" aria-label="Cancel" disabled={saving} onClick={() => setPickOpen(false)}><Close size={22} /></button>
          </div>
          <div className="fb-pickgrid">
            {sides.map(({ k, team }) => {
              const all = rawRoster(team.id);
              return (
                <div key={k} className="fb-pickcol">
                  <div className="fb-pickhead"><b>{team.name}</b><span className="lbl">{pick[k].length} OF {need(team.id)}</span></div>
                  {all.length <= limitOf(team.id) ? <p className="fb-pickauto">{all.map((x) => x.name).join(' & ') || 'No players'} play{all.length === 1 ? 's' : ''} automatically.</p> : null}
                  {all.map((pl) => {
                    const sel = all.length <= limitOf(team.id) || pick[k].includes(pl.id);
                    return (
                      <button key={pl.id} type="button" className="fb-pick" aria-pressed={sel} data-on={on(sel)} disabled={all.length <= limitOf(team.id) || saving} onClick={() => toggle(k, pl.id)}>
                        <span>{pl.name}</span><i>{sel ? <Check size={18} /> : null}</i>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="sc-note">Choose {perSide === 1 ? 'one player' : 'two players'} for each team. They can be credited with goals; the rest of the team sits this match out.</div>
          <div className="sc-sheet-foot">
            <button type="button" className="sc-btn" data-variant="gray" disabled={saving} onClick={() => setPickOpen(false)}>CANCEL</button>
            <button type="button" className="sc-btn" data-variant="primary" disabled={!pickReady || saving} onClick={() => void startMatch()}>{saving ? 'SAVING…' : 'START MATCH'}</button>
          </div>
        </div>
      </div>

      <div className="sc-scrim" data-open={on(sheet || showFinal)} onClick={() => { if (sheet) setSheet(false); }}>
        <div className="sc-sheet" role="dialog" aria-modal aria-label={showFinal ? 'Result' : 'End the match'} style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
          <div className="sc-sheet-head">
            <div>
              <div className="lbl" style={{ color: 'var(--amber)' }}>END OF MATCH</div>
              <div className="sc-sheet-title">{showFinal ? 'Result' : 'End the match'}</div>
            </div>
            <button className="sc-x" aria-label="Close" onClick={() => { setSheet(false); if (showFinal) setAck(true); }}><Close size={22} /></button>
          </div>
          {showFinal ? (
            <>
              <div className="sc-result">
                <h3>{s.result!.text}</h3>
                {s.games.filter((x) => x.done || x.a + x.b > 0).map((x, i) => <p key={i}><span>Game {i + 1}</span><b>{x.a}–{x.b}</b></p>)}
              </div>
              <div className="sc-note">The result is published to the live view. Undo the last goal to reopen scoring.</div>
              <div className="sc-sheet-foot">
                <button type="button" className="sc-btn" data-variant="gray" disabled={!canUndo} onClick={undo}>UNDO LAST GOAL</button>
                <button type="button" className="sc-btn" data-variant="primary" onClick={() => setAck(true)}>DONE</button>
              </div>
            </>
          ) : (
            <>
              <div className="sc-opts" data-cols="2">
                {sides.map(({ k, team }) => <button key={k} type="button" className="sc-opt" aria-pressed={res === k} data-on={on(res === k)} onClick={() => setRes(k)}>{team.name} won</button>)}
                <button type="button" className="sc-opt" aria-pressed={res === 'nr'} data-on={on(res === 'nr')} onClick={() => setRes('nr')}>NO RESULT</button>
              </div>
              <div className="sc-result">
                <h3>{res === 'nr' ? 'No result' : `${s.teams[res === 'a' ? 0 : 1]!.name} won`}</h3>
                <p><span>{s.teams[0]!.name}</span><b>{s.gamesWon.a} {s.gamesWon.a === 1 ? 'game' : 'games'} ({g.a})</b></p>
                <p><span>{s.teams[1]!.name}</span><b>{s.gamesWon.b} {s.gamesWon.b === 1 ? 'game' : 'games'} ({g.b})</b></p>
              </div>
              <div className="sc-note">Use this for a forfeit or an agreed result. A match that is played out ends by itself. Publishing locks scoring; you can still undo it.</div>
              <div className="sc-sheet-foot">
                <button type="button" className="sc-btn" data-variant="gray" onClick={() => setSheet(false)}>BACK TO SCORING</button>
                <button type="button" className="sc-btn" data-variant="danger" disabled={busy || !connected} onClick={publish}>PUBLISH RESULT</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
