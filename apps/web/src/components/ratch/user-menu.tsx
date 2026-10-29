'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

/** The avatar in the header. It opens a small menu with the profile page and log out. */
export function UserMenu({ name, role, avatar, signOut }: { name: string; role: string; avatar?: string | null; signOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className="rx-menu" ref={box}>
      <button type="button" className="rx-avatar" aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} title={name} onClick={() => setOpen(!open)}>
        {avatar ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={avatar} alt="" /> : initials(name)}
      </button>
      {open && (
        <div className="rx-pop" role="menu">
          <div className="rx-pop-who"><b>{name}</b><span className="lbl lbl-sm">{role.toUpperCase()}</span></div>
          <Link href="/profile" role="menuitem" className="rx-pop-item" onClick={() => setOpen(false)}>Profile</Link>
          <form action={signOut}><button role="menuitem" className="rx-pop-item" data-danger="">Log out</button></form>
        </div>
      )}
    </div>
  );
}
