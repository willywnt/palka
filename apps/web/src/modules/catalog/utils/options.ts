import type { VariantOption } from '../validators/options';

/** A set of variants sharing the same first-dimension option value. */
export type VariantGroup<T> = {
  /** The first option value, e.g. "iPhone 16". Empty string = no first option. */
  value: string;
  variants: T[];
};

/**
 * Group variants by their first option dimension's value, preserving the order
 * each group is first seen. Variants without a first option collect under the
 * trailing empty-key group. Returns `null` when no variant carries any option —
 * the caller renders a plain, ungrouped list (backward compatible).
 */
export function groupVariantsByFirstOption<T extends { options: VariantOption[] }>(
  variants: T[],
): VariantGroup<T>[] | null {
  if (!variants.some((variant) => variant.options.length > 0)) return null;

  const groups = new Map<string, T[]>();
  for (const variant of variants) {
    const key = variant.options[0]?.value ?? '';
    const bucket = groups.get(key);
    if (bucket) bucket.push(variant);
    else groups.set(key, [variant]);
  }

  return [...groups.entries()].map(([value, grouped]) => ({ value, variants: grouped }));
}

/** Option values after the first dimension, joined for a leaf label (e.g. "Hitam · 128GB"). */
export function formatSubOptions(options: VariantOption[]): string {
  return options
    .slice(1)
    .map((option) => option.value)
    .join(' · ');
}
