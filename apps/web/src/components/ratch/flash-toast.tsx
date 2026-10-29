'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from './toast';

/** Turns a message that arrived in the address (`?notice=` or `?error=`, after a form redirect) into a toast, then cleans the address. */
export function FlashToast({ notice, error }: { notice?: string; error?: string }) {
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (error) toast.error(error);
    if (notice) toast.success(notice);
    if (error || notice) router.replace(path, { scroll: false });
  }, [notice, error, path, router]);
  return null;
}
