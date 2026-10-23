export function nightsBetween(checkIn: string, checkOut: string): number {
  const [a, b] = [Date.parse(checkIn + 'T00:00:00Z'), Date.parse(checkOut + 'T00:00:00Z')];
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function overlapNights(resCheckIn: string, resCheckOut: string, from: string, toInclusive: string): number {
  const toExcl = addDays(toInclusive, 1);
  const start = resCheckIn > from ? resCheckIn : from;
  const end = resCheckOut < toExcl ? resCheckOut : toExcl;
  return nightsBetween(start, end);
}

export function computeTotals(reservation: any, services: any[], payments: any[], taxRateBp: number) {
  const nights = nightsBetween(reservation.check_in, reservation.check_out);
  const roomCents = Math.max(0, nights * reservation.nightly_rate_cents - reservation.discount_cents);
  const servicesCents = services.reduce((s, x) => s + x.quantity * x.unit_price_cents, 0);
  const subtotal = roomCents + servicesCents;
  const taxCents = Math.round((subtotal * taxRateBp) / 10000);
  const totalCents = subtotal + taxCents;
  const paidCents = payments.reduce((s, p) => s + p.amount_cents, 0);
  return {
    nights, roomCents, servicesCents, subtotal, taxCents, totalCents, paidCents,
    balanceCents: totalCents - paidCents
  };
}