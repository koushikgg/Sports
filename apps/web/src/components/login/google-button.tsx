'use client';
import { useFormStatus } from 'react-dom';

function Inner() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="lg-google" disabled={pending} data-busy={pending ? 'true' : undefined}>
      <span className="lg-g" aria-hidden>G</span>
      {pending ? 'Connecting to Google…' : 'Continue with Google'}
    </button>
  );
}

/** The server action starts the Google flow; the button shows progress while the redirect happens. */
export function GoogleButton({ action }: { action: () => Promise<void> }) {
  return <form action={action}><Inner /></form>;
}
