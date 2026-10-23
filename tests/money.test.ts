import { describe, it, expect } from 'vitest';
import { nightsBetween, computeTotals, addDays, overlapNights } from '../server/money.js';
describe('nightsBetween', () => {
  it('counts full nights between two dates', () => { expect(nightsBetween('2025-10-20', '2025-10-25')).toBe(5); });
  it('returns 0 for same-day stays', () => { expect(nightsBetween('2025-10-20', '2025-10-20')).toBe(0); });
  it('returns 0 when checkout is before checkin', () => { expect(nightsBetween('2025-10-25', '2025-10-20')).toBe(0); });
  it('handles month boundaries', () => { expect(nightsBetween('2025-10-31', '2025-11-03')).toBe(3); });
});
describe('addDays', () => {
  it('advances one day across month end', () => { expect(addDays('2025-10-31', 1)).toBe('2025-11-01'); });
  it('goes back across year end', () => { expect(addDays('2026-01-01', -1)).toBe('2025-12-31'); });
});
describe('overlapNights', () => {
  it('returns full overlap when stay is inside range', () => { expect(overlapNights('2025-10-20', '2025-10-23', '2025-10-15', '2025-10-31')).toBe(3); });
  it('clips stay start to range start', () => { expect(overlapNights('2025-10-10', '2025-10-15', '2025-10-13', '2025-10-31')).toBe(2); });
  it('clips stay end to range end', () => { expect(overlapNights('2025-10-28', '2025-11-05', '2025-10-01', '2025-10-31')).toBe(3); });
  it('returns 0 when stay is outside range', () => { expect(overlapNights('2025-09-01', '2025-09-05', '2025-10-01', '2025-10-31')).toBe(0); });
});
describe('computeTotals', () => {
  const resv = { check_in: '2025-10-20', check_out: '2025-10-23', nightly_rate_cents: 10000, discount_cents: 0 };
  it('computes room + services + tax + balance', () => {
    const t = computeTotals(resv, [{ quantity: 2, unit_price_cents: 2500 }], [{ amount_cents: 20000 }], 1000);
    expect(t.nights).toBe(3); expect(t.roomCents).toBe(30000); expect(t.servicesCents).toBe(5000);
    expect(t.taxCents).toBe(3500); expect(t.totalCents).toBe(38500); expect(t.paidCents).toBe(20000); expect(t.balanceCents).toBe(18500);
  });
  it('floors room subtotal at zero when discount exceeds rate', () => {
    const t = computeTotals({ ...resv, discount_cents: 999999 }, [], [], 0); expect(t.roomCents).toBe(0); expect(t.totalCents).toBe(0);
  });
  it('zero tax rate yields zero tax', () => { const t = computeTotals(resv, [], [], 0); expect(t.taxCents).toBe(0); expect(t.totalCents).toBe(30000); });
});