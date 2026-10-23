'use client';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background,color,box-shadow,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-white shadow-soft hover:bg-accent-strong',
        soft: 'bg-accent-wash text-accent-strong hover:bg-accent-soft/40',
        outline: 'border border-line bg-canvas text-ink hover:bg-surface',
        ghost: 'text-ink-2 hover:bg-surface',
        dark: 'bg-ink text-white hover:bg-ink-2',
        ok: 'bg-ok text-white hover:brightness-95',
        warn: 'bg-warn-wash text-warn hover:brightness-95',
        danger: 'bg-[#fdecec] text-danger hover:brightness-95',
      },
      size: {
        sm: 'h-9 rounded-full px-3 text-sm',
        md: 'h-11 rounded-full px-4 text-[15px]',
        lg: 'h-12 rounded-2xl px-5 text-base',
        xl: 'h-14 rounded-2xl px-6 text-lg',
        icon: 'size-11 rounded-full',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';

export function Chip({
  active,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 shrink-0 select-none items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors',
        active ? 'border-ink bg-ink text-white' : 'border-line bg-canvas text-ink-2 hover:border-line-strong hover:bg-surface',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
