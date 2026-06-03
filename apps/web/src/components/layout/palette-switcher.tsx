'use client';

import { useEffect, useState } from 'react';
import { Check, Palette } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const PALETTES = [
  { key: 'ombak', label: 'Ombak', hint: 'Teal', swatch: 'oklch(0.58 0.1 205)' },
  { key: 'senja', label: 'Senja', hint: 'Amber', swatch: 'oklch(0.72 0.15 70)' },
  { key: 'rimba', label: 'Rimba', hint: 'Green', swatch: 'oklch(0.55 0.12 158)' },
  { key: 'anggur', label: 'Anggur', hint: 'Berry', swatch: 'oklch(0.55 0.2 350)' },
  { key: 'tinta', label: 'Tinta', hint: 'Coral', swatch: 'oklch(0.62 0.19 28)' },
] as const;

const STORAGE_KEY = 'olshop-palette';
const DEFAULT_PALETTE = 'ombak';

function applyPalette(key: string) {
  const root = document.documentElement;
  if (key === DEFAULT_PALETTE) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', key);
}

/** Lets the user swap the brand accent at runtime (persisted in localStorage). */
export function PaletteSwitcher() {
  const [active, setActive] = useState<string>(DEFAULT_PALETTE);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) ?? DEFAULT_PALETTE;
    setActive(saved);
    applyPalette(saved);
  }, []);

  function pick(key: string) {
    setActive(key);
    applyPalette(key);
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* ignore storage failures (e.g. private mode) */
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Palette className="size-4" />
          <span className="sr-only">Change accent colour</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Accent</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {PALETTES.map((palette) => (
          <DropdownMenuItem
            key={palette.key}
            onSelect={() => pick(palette.key)}
            className="justify-between gap-2"
          >
            <span className="flex items-center gap-2">
              <span
                className="size-4 rounded-full border"
                style={{ backgroundColor: palette.swatch }}
              />
              {palette.label}
              <span className="text-muted-foreground text-xs">{palette.hint}</span>
            </span>
            {active === palette.key ? <Check className="size-4 shrink-0" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
