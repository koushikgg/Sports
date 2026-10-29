'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveProfile } from '@/app/profile/actions';
import { Avatar } from '@/components/ratch/avatar';

/** Centre-crops to a square and shrinks to 256px, so the photo stored is a few tens of KB. */
async function toSquare(file: File, size = 256): Promise<string> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.85);
}

export function ProfileEditor({ name, email, role, avatar }: { name: string; email: string; role: string; avatar: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState(name);
  const [photo, setPhoto] = useState<string | null>(null); // a new, unsaved photo
  const [removed, setRemoved] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const shown = removed ? null : (photo ?? avatar);
  const dirty = draft.trim() !== name || !!photo || removed;

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return setMsg({ text: 'Choose an image file.', bad: true });
    if (f.size > 12 * 1024 * 1024) return setMsg({ text: 'That image is over 12 MB.', bad: true });
    try { setPhoto(await toSquare(f)); setRemoved(false); setMsg(null); } catch { setMsg({ text: 'That image could not be read.', bad: true }); }
  };

  const save = () => {
    const fd = new FormData();
    fd.set('name', draft);
    fd.set('avatar', photo ?? (removed ? 'remove' : ''));
    start(async () => {
      const r = await saveProfile(fd);
      if (r.error) return setMsg({ text: r.error, bad: true });
      setPhoto(null); setRemoved(false); setMsg({ text: 'Profile saved.' });
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
        <div className="pf-acts">
          <button type="submit" className="pf-save" disabled={!dirty || !draft.trim() || pending}>{pending ? 'SAVING…' : 'SAVE'}</button>
          {msg && <span className="pf-msg" data-bad={msg.bad ? '' : undefined} role="status">{msg.text}</span>}
        </div>
      </form>
    </div>
  );
}
