'use client';
import { usePathname, useSearchParams } from 'next/navigation';

export type Route =
  | { step: 'chat' }
  | { step: 'shops'; productId: string }
  | { step: 'shop'; productId: string; shopId: string };

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'p' && parts[1]) {
    if (parts[2] === 's' && parts[3]) return { step: 'shop', productId: parts[1], shopId: parts[3] };
    return { step: 'shops', productId: parts[1] };
  }
  return { step: 'chat' };
}

export function useRoute(): Route & { mall: boolean } {
  const pathname = usePathname();
  const sp = useSearchParams();
  return { ...parseRoute(pathname ?? '/'), mall: sp?.get('mall') === '1' };
}

/** Shallow navigation that never remounts the shell (Next syncs usePathname with pushState). */
export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (typeof window === 'undefined') return;
  const url = path + (path.includes('?') ? '' : keepFlags());
  if (opts.replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}

/** keep demo flags like ?manual=1 across navigation */
function keepFlags(): string {
  const sp = new URLSearchParams(window.location.search);
  const keep = new URLSearchParams();
  for (const k of ['manual']) if (sp.get(k)) keep.set(k, sp.get(k)!);
  const s = keep.toString();
  return s ? `?${s}` : '';
}

export function goBack(fallback: string) {
  if (typeof window !== 'undefined' && window.history.length > 1 && (window.history.state as unknown) !== undefined) {
    const before = window.location.pathname;
    window.history.back();
    // if there was no in-app history entry, fall back
    setTimeout(() => {
      if (window.location.pathname === before) navigate(fallback, { replace: true });
    }, 250);
  } else navigate(fallback);
}
