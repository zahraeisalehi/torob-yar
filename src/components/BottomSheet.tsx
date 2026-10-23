'use client';
import { Drawer } from 'vaul';

export const SNAPS = [0.22, 0.55, 0.92] as const;

/** Persistent, non-modal bottom sheet (mobile step 2) with snap points 22% / 55% / 92%. */
export function BottomSheet({
  snap,
  setSnap,
  children,
  title,
}: {
  snap: number;
  setSnap: (s: number) => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <Drawer.Root
      open
      modal={false}
      dismissible={false}
      snapPoints={[...SNAPS]}
      activeSnapPoint={snap}
      setActiveSnapPoint={(s) => typeof s === 'number' && setSnap(s)}
      noBodyStyles
      disablePreventScroll
    >
      <Drawer.Portal>
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-30 flex h-[96dvh] flex-col rounded-t-[24px] border-t border-line bg-canvas shadow-[0_-8px_30px_rgb(16_24_40/0.12)] outline-none"
          data-testid="bottom-sheet"
        >
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          <div className="flex justify-center pb-1 pt-2.5">
            <Drawer.Handle className="!h-1.5 !w-10 !rounded-full !bg-line-strong" />
          </div>
          <div
            className={`no-scrollbar flex-1 overscroll-contain px-3 pb-[env(safe-area-inset-bottom)] ${snap >= 0.9 ? 'overflow-y-auto' : 'overflow-hidden'}`}
            data-vaul-no-drag={snap >= 0.9 ? true : undefined}
          >
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
