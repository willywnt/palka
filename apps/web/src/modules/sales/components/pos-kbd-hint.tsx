import { cn } from '@/lib/utils';

/** Subtle keyboard-hint chip (desktop only) — mirrors the command-palette style. */
export function KbdHint({ label, className }: { label: string; className?: string }) {
  return (
    <kbd
      className={cn(
        'bg-muted text-muted-foreground pointer-events-none hidden rounded px-1.5 py-0.5 font-sans text-[10px] md:inline-block',
        className,
      )}
    >
      {label}
    </kbd>
  );
}
