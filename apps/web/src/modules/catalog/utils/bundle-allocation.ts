/** One component of a bundle for allocation: its per-unit standard value + per-bundle qty. */
export type BundleAllocationComponent = {
  /** The component's standard per-unit value in MINOR units (price for a sale, cost for a buy). */
  weightMinor: number;
  /** How many of this component go into one bundle. */
  quantity: number;
};

/**
 * Split a bundle's total (price or cost, in MINOR units — e.g. rupiah×100) into a
 * per-component UNIT amount, proportional to each component's per-unit standard value.
 * A unit of component `i` gets `round(total × weightᵢ / Σ(weightⱼ × qtyⱼ))`. When every
 * weight is 0 the total is split equally across all units. Computed in BigInt so the
 * intermediate product can't lose precision at Decimal(12,2) magnitudes.
 *
 * Returns one per-unit amount per input component, aligned to input order.
 *
 * Note: a 2-decimal unit price × integer quantity cannot always reproduce an arbitrary
 * total exactly, so `Σ(unitᵢ × qtyᵢ)` may differ from `totalMinor` by a few minor units
 * (≈0 for whole-rupiah IDR). Callers should derive the document total from the emitted
 * lines (`Σ unitᵢ × qtyᵢ`) so revenue/COGS stay internally consistent.
 */
export function allocateBundleUnitAmounts(
  totalMinor: number,
  components: BundleAllocationComponent[],
): number[] {
  if (components.length === 0) return [];

  const total = BigInt(Math.max(0, Math.round(totalMinor)));
  const weights = components.map((component) =>
    BigInt(Math.max(0, Math.round(component.weightMinor))),
  );
  const quantities = components.map((component) =>
    BigInt(Math.max(0, Math.trunc(component.quantity))),
  );

  const totalWeight = components.reduce(
    (sum, _component, index) => sum + weights[index]! * quantities[index]!,
    0n,
  );

  // Round-half-up integer division: round(a / b) === (2a + b) / (2b).
  const roundDiv = (numerator: bigint, denominator: bigint): number =>
    denominator <= 0n ? 0 : Number((numerator * 2n + denominator) / (denominator * 2n));

  if (totalWeight <= 0n) {
    const totalUnits = quantities.reduce((sum, quantity) => sum + quantity, 0n);
    const perUnit = roundDiv(total, totalUnits);
    return components.map(() => perUnit);
  }

  return components.map((_component, index) => roundDiv(total * weights[index]!, totalWeight));
}
