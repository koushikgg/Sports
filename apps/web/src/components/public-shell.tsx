import Link from 'next/link';

const links = [
  ['/', 'Home'],
  ['/sports', 'Sports'],
] as const;

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand focus:px-3 focus:py-2 focus:text-black">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-bold">Sports <span className="text-brand">Hub</span></Link>
          <nav aria-label="Main" className="flex gap-5 text-sm text-muted">
            {links.map(([href, label]) => (
              <Link key={href} href={href} className="hover:text-fg">{label}</Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 pb-10 pt-4 text-xs text-muted">
        <Link href="/login" className="hover:text-fg">Admin sign in</Link>
      </footer>
    </>
  );
}
