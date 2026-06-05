import { describe, expect, it } from 'vitest';

import { formatSubOptions, groupVariantsByFirstOption } from '@/modules/catalog/utils/options';
import {
  parseOptionTypes,
  parseVariantOptions,
  type VariantOption,
} from '@/modules/catalog/validators/options';

describe('parseVariantOptions', () => {
  it('parses and trims a valid options array', () => {
    expect(
      parseVariantOptions([
        { name: ' Model ', value: ' 16 ' },
        { name: 'Warna', value: 'Hitam' },
      ]),
    ).toEqual([
      { name: 'Model', value: '16' },
      { name: 'Warna', value: 'Hitam' },
    ]);
  });

  it('returns [] for null, legacy, or malformed shapes', () => {
    expect(parseVariantOptions(null)).toEqual([]);
    expect(parseVariantOptions('nope')).toEqual([]);
    expect(parseVariantOptions([{ name: 'Model' }])).toEqual([]);
    expect(parseVariantOptions([{ name: '', value: 'x' }])).toEqual([]);
  });
});

describe('parseOptionTypes', () => {
  it('parses and trims a valid dimension list', () => {
    expect(parseOptionTypes([' Model ', 'Warna'])).toEqual(['Model', 'Warna']);
  });

  it('returns [] for null or malformed shapes', () => {
    expect(parseOptionTypes(null)).toEqual([]);
    expect(parseOptionTypes([1, 2])).toEqual([]);
  });
});

describe('groupVariantsByFirstOption', () => {
  const opt = (name: string, value: string): VariantOption => ({ name, value });

  it('returns null when no variant carries any option', () => {
    expect(groupVariantsByFirstOption([{ options: [] }, { options: [] }])).toBeNull();
  });

  it('groups by the first option value, preserving first-seen order', () => {
    const variants = [
      { id: 'a', options: [opt('Model', '16'), opt('Warna', 'Hitam')] },
      { id: 'b', options: [opt('Model', '17'), opt('Warna', 'Hitam')] },
      { id: 'c', options: [opt('Model', '16'), opt('Warna', 'Putih')] },
    ];

    const groups = groupVariantsByFirstOption(variants);

    expect(groups?.map((group) => group.value)).toEqual(['16', '17']);
    expect(groups?.[0]?.variants.map((v) => v.id)).toEqual(['a', 'c']);
    expect(groups?.[1]?.variants.map((v) => v.id)).toEqual(['b']);
  });

  it('collects variants without a first option under the empty-key group', () => {
    const groups = groupVariantsByFirstOption([
      { id: 'a', options: [opt('Model', '16')] },
      { id: 'b', options: [] },
    ]);

    expect(groups?.map((group) => group.value)).toEqual(['16', '']);
  });
});

describe('formatSubOptions', () => {
  it('joins option values after the first dimension', () => {
    expect(
      formatSubOptions([
        { name: 'Model', value: '16' },
        { name: 'Warna', value: 'Hitam' },
        { name: 'Storage', value: '128GB' },
      ]),
    ).toBe('Hitam · 128GB');
  });

  it('returns an empty string when there is no sub-dimension', () => {
    expect(formatSubOptions([{ name: 'Model', value: '16' }])).toBe('');
    expect(formatSubOptions([])).toBe('');
  });
});
