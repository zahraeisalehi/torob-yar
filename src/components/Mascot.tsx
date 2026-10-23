'use client';
import { cn } from '@/lib/cn';

// Our own pixel-art sprout creature (not Torob's radish). 16×16 grid.
const ROWS = [
  '......dd........',
  '.....dLLd..dd...',
  '.....dLLLddLLd..',
  '......dLLdLLd...',
  '.......ddLdd....',
  '........s.......',
  '....oooooooo....',
  '...oBBBBBBBBo...',
  '..oBBhBBBBBBBo..',
  '..oBBeBBBBeBBo..',
  '..oBBeBBBBeBBo..',
  '..oBpBBmmBBpBo..',
  '..oBBBBBBBBBBo..',
  '...oBBBBBBBBo...',
  '....oooooooo....',
  '.....oo..oo.....',
];
const COLORS: Record<string, string> = {
  d: '#2f6b2c',
  L: '#6cc04a',
  s: '#3f8f3a',
  o: '#2f6b2c',
  B: '#9bd97a',
  h: '#c9f0b4',
  e: '#1f2430',
  p: '#f6a5b8',
  m: '#2f6b2c',
};

export function Mascot({ size = 64, thinking = false, className }: { size?: number; thinking?: boolean; className?: string }) {
  return (
    <div className={cn('relative inline-flex items-end', className)} aria-hidden>
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
        className={cn(thinking ? 'animate-[bob_1.4s_ease-in-out_infinite]' : 'animate-[mascot-idle_3s_ease-in-out_infinite]')}
      >
        {ROWS.flatMap((row, y) =>
          [...row].map((c, x) =>
            COLORS[c] ? (
              <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={COLORS[c]} className={c === 'e' ? 'mascot-eye' : undefined} />
            ) : null,
          ),
        )}
      </svg>
      {thinking && <ThinkingDots className="ms-1 mb-1" />}
    </div>
  );
}

export function ThinkingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} role="status" aria-label="در حال فکر کردن">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 rounded-full bg-accent animate-bob" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}
