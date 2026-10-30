'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveProfile } from '@/app/profile/actions';
import { Avatar } from '@/components/ratch/avatar';
import { toast } from '@/components/ratch/toast';
import { PICKABLE_ROLES, roleLabel } from '@/lib/player-role';

/** Centre-crops to a square and shrinks to 256px, so the photo stored is a few tens of KB. */
async function toSquare(file: File, size = 256): Promise<string> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.85);
}

export function ProfileEditor({ name, email, role, avatar, cricketRole }: { name: string; email: string; role: string; avatar: string | null; cricketRole: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState(name);
  const [photo, setPhoto] = useState<string | null>(null); // a new, unsaved photo
  const [removed, setRemoved] = useState(false);
  const [playRole, setPlayRole] = useState(cricketRole ?? '');
  const file = useRef<HTMLInputElement>(null);

  const shown = removed ? null : (photo ?? avatar);
  const dirty = draft.trim() !== name || !!photo || removed || playRole !== (cricketRole ?? '');

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast.error('Choose an image file.');
    if (f.size > 12 * 1024 * 1024) return toast.error('That image is over 12 MB.');
    try { setPhoto(await toSquare(f)); setRemoved(false); } catch { toast.error('That image could not be read.'); }
  };

  const save = () => {
    const fd = new FormData();
    fd.set('name', draft);
    fd.set('avatar', photo ?? (removed ? 'remove' : ''));
    fd.set('cricketRole', playRole);
    start(async () => {
      const r = await saveProfile(fd);
      if (r.error) return toast.error(r.error);
      setPhoto(null); setRemoved(false); toast.success('Profile saved.');
      router.refresh();
    });
  };

  return (
    <div className="pf-edit">
      <div className="pf-photo">
        {shown ? <Avatar name={draft || name} size={96} src={shown} /> : <Avatar name={draft || name} size={96} />}
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" className="pf-link" onClick={() => file.current?.click()}>{shown ? 'CHANGE PHOTO' : 'ADD PHOTO'}</button>
          {shown && <button type="button" className="pf-link" onClick={() => { setPhoto(null); setRemoved(true); }}>REMOVE</button>}
        </div>
      </div>
      <form className="pf-form" onSubmit={(e) => { e.preventDefault(); if (dirty && draft.trim()) save(); }}>
        <span className="lbl">MY PROFILE · {role.toUpperCase()}</span>
        <label className="pf-field"><span className="lbl">NAME</span><input value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} /></label>
        <label className="pf-field"><span className="lbl">EMAIL</span><input value={email} readOnly tabIndex={-1} /></label>
        <div className="pf-field" role="group" aria-label="Cricket role">
          <span className="lbl">CRICKET ROLE</span>
          <div className="pf-roles">
            {PICKABLE_ROLES.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={playRole === v} data-on={playRole === v ? 'true' : undefined} onClick={() => setPlayRole(playRole === v ? '' : v)}>{l}</button>
            ))}
          </div>
          {playRole === 'WK' && <small className="pf-hint">An organiser marked you as {roleLabel('WK')?.toLowerCase()}. Pick a role above to change it.</small>}
        </div>
        <div className="pf-acts">
          <button type="submit" className="pf-save" disabled={!dirty || !draft.trim() || pending}>{pending ? 'SAVING…' : 'SAVE'}</button>
        </div>
      </form>
    </div>
  );
}
