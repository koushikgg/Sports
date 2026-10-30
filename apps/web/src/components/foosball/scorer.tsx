'use client';
import '@fontsource-variable/inter';
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/jetbrains-mono';
import '@/components/cricket/ratch.css';
import './foosball.css';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchSnapshot } from '@sports/shared';
import { currentGame, gamesToWin, type FoosballState, type Side } from '@sports/sports-engine/src/foosball';
import { toast, Toaster } from '@/components/ratch/toast';
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

  const everConnected = useRef(false);
  if (connected) everConnected.current = true;
  const conn = connected ? 'live' : everConnected.current ? 'off' : 'wait';
  useEffect(() => { if (error) toast.error(error); }, [error]);
  useEffect(() => { if (!s.result) setAck(false); }, [s.result]);

  const canScore = connected && !s.result;
  const canUndo = connected && !!s.lastAction && !busy;
  const run = useCallback(async (type: string, payload: Record<string, unknown>, message?: string) => {
    const ok = await send(type, payload);
    if (ok && message) toast.success(message);
    return ok;
  }, [send]);
  const goal = (side: Side) => { if (canScore) void run('goal', { side }); };
  const undo = () => { if (canUndo) void run('undo', {}, `${s.lastAction!.label.toLowerCase()} removed`); };

  const keys = useRef<(e: KeyboardEvent) => void>(undefined);
  keys.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || sheet) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'arrowleft') { e.preventDefault(); goal('a'); }
    else if (k === 'b' || k === 'arrowright') { e.preventDefault(); goal('b'); }
    else if (k === 'u') { e.preventDefault(); undo(); }
    else if (k === 'escape') setSheet(false);
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

  const publish = () => {
    const body = res === 'nr' ? { outcome: 'no_result' } : { outcome: 'win', winnerTeamId: res === 'a' ? s.teams[0]!.id : s.teams[1]!.id };
    void run('finish', body, 'Result published to live view').then((ok) => { if (ok) setSheet(false); });
  };

  return (
    <div className="ratch sc-root fb-root" data-theme="dark">
      <div className="sc-top">
        <div className="sc-brand">
          <Link href={backHref} aria-label="Back to match" className="mono" style={{ color: 'var(--text-tertiary)', fontSize: 16, marginRight: 4 }}>←</Link>
          <span className="sc-brand-dot" />
          <span className="sc-brand-name">Ratchet</span>
          <span className="sc-tag">SCORER</span>
        </div>
        <Link href="/matches" className="sc-allmatches">ALL MATCHES</Link>
        <div className="sc-matchmeta">
          <b>{s.teams.map((t) => t.name).join(' vs ')}</b>
          <span className="lbl" style={{ letterSpacing: '0.04em' }}>
            FOOSBALL · {s.bestOf === 1 ? 'SINGLE GAME' : `BEST OF ${s.bestOf}`} TO {s.firstTo}{s.winBy === 2 ? ', WIN BY 2' : ''}{venue ? ` · ${venue.toUpperCase()}` : ''}
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
          <div className="fb-status" role="status"><span className="lbl">{s.result ? 'FINAL' : `GAME ${s.games.length}${s.bestOf > 1 ? ` OF ${s.bestOf}` : ''}`}</span><b>{status}</b></div>
          <div className="fb-panels">
            {sides.map(({ k, team }) => {
              const won = s.gamesWon[k];
              return (
                <button key={k} type="button" className="fb-panel" data-side={k} data-win={on(s.result?.winnerTeamId === team.id)} disabled={!canScore} onClick={() => goal(k)} aria-label={`Goal for ${team.name}`}>
                  <span className="fb-team">{team.name}</span>
                  <span className="fb-score" aria-live="polite">{g[k]}</span>
                  {s.bestOf > 1 && (
                    <span className="fb-dots" aria-label={`${won} of ${winsNeeded} games`}>
                      {Array.from({ length: winsNeeded }, (_, i) => <i key={i} data-on={on(i < won)} />)}
                      <small>{won} {won === 1 ? 'GAME' : 'GAMES'}</small>
                    </span>
                  )}
                  <span className="fb-tap">{s.result ? 'MATCH OVER' : '+ GOAL'}<kbd aria-hidden>{k.toUpperCase()}</kbd></span>
                </button>
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
            <span className="sc-undo-ico" aria-hidden>↶</span>
            <span className="sc-undo-text"><b>{undoTitle}</b><small>{undoNote}</small></span>
            <kbd aria-hidden>U</kbd>
          </button>
          <div className="sc-pills">
            <button className="sc-pill" data-tone="danger" disabled={!connected || !!s.result} onClick={() => { setRes('a'); setSheet(true); }}>END MATCH</button>
            <button className="sc-pill" data-solid="card" onClick={() => { release(); toast.success('Scorer lock released'); }}>RELEASE LOCK</button>
          </div>
          <div className="sc-kbd">
            <span className="lbl lbl-sm">KEYBOARD</span>
            <span>A OR ← GOAL FOR {s.teams[0]!.name.toUpperCase()} · B OR → GOAL FOR {s.teams[1]!.name.toUpperCase()} · U UNDO · ESC CLOSE</span>
          </div>
        </div>
      </div>

      <Toaster />

      <div className="sc-scrim" data-open={on(sheet || showFinal)} onClick={() => { if (sheet) setSheet(false); }}>
        <div className="sc-sheet" role="dialog" aria-modal aria-label={showFinal ? 'Result' : 'End the match'} style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
          <div className="sc-sheet-head">
            <div>
              <div className="lbl" style={{ color: 'var(--amber)' }}>END OF MATCH</div>
              <div className="sc-sheet-title">{showFinal ? 'Result' : 'End the match'}</div>
            </div>
            <button className="sc-x" aria-label="Close" onClick={() => { setSheet(false); if (showFinal) setAck(true); }}>×</button>
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
