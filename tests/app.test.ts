import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let app: any; let cookie = ''; let db: any;
function api() { return request(app).set('Cookie', cookie); }
function today() { return new Date().toISOString().slice(0, 10); }
function addDays(d: string, n: number) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hotelyx-test-'));
  process.env.HOTELYX_DB_PATH = join(dir, 'test.db');
  const appModule = await import('../server/app.js'); const dbModule = await import('../server/db.js');
  app = appModule.createApp(); db = dbModule.db;
  const r = await request(app).post('/api/setup').send({ fullName: 'Test Admin', email: 'admin@test.local', password: 'password123', hotelName: 'Test Hotel' });
  expect(r.status).toBe(200); cookie = r.headers['set-cookie'][0].split(';')[0];
});
beforeEach(() => {
  db.exec(`DELETE FROM audit_log; DELETE FROM payments; DELETE FROM invoices; DELETE FROM reservation_services; DELETE FROM housekeeping_tasks; DELETE FROM maintenance_tickets; DELETE FROM reservations; DELETE FROM guests; DELETE FROM rooms; DELETE FROM room_types; DELETE FROM services;`);
});
describe('auth', () => {
  it('rejects /api/rooms without a session', async () => { const r = await request(app).get('/api/rooms'); expect(r.status).toBe(401); });
  it('setup screen remains closed after first admin exists', async () => {
    const r = await request(app).post('/api/setup').send({ fullName: 'X', email: 'x@x.com', password: 'password123', hotelName: 'X' }); expect(r.status).toBe(409);
  });
});
describe('rooms & guests', () => {
  it('creates a room and a guest', async () => {
    const room = await api().post('/api/rooms').send({ number: '101', floor: 1, roomTypeId: null, status: 'available', notes: '' }); expect(room.status).toBe(201);
    const guest = await api().post('/api/guests').send({ firstName: 'Alice', lastName: 'Martin', phone: '0611111111', email: 'a@m.com', country: 'Maroc' }); expect(guest.status).toBe(201);
  });
  it('prevents deleting a room with reservations', async () => {
    const room = await api().post('/api/rooms').send({ number: '102', floor: 1, roomTypeId: null, status: 'available' });
    const guest = await api().post('/api/guests').send({ firstName: 'Bob', lastName: 'Dupont', phone: '0622222222', email: 'b@d.com' });
    await api().post('/api/reservations').send({ guestId: guest.body.id, roomId: room.body.id, checkIn: addDays(today(), 5), checkOut: addDays(today(), 8), nightlyRateCents: 80000, status: 'confirmed' });
    const del = await api().delete(`/api/rooms/${room.body.id}`); expect(del.status).toBe(409);
  });
});
describe('reservation overlap guard', () => {
  async function seedRoomAndGuest() {
    const room = await api().post('/api/rooms').send({ number: '201', floor: 2, roomTypeId: null, status: 'available' });
    const guest = await api().post('/api/guests').send({ firstName: 'Test', lastName: 'Guest', phone: '0600000000', email: 't@g.com' });
    return { roomId: room.body.id, guestId: guest.body.id };
  }
  it('rejects an overlapping reservation for the same room', async () => {
    const { roomId, guestId } = await seedRoomAndGuest();
    const first = await api().post('/api/reservations').send({ guestId, roomId, checkIn: '2025-10-20', checkOut: '2025-10-25', nightlyRateCents: 80000, status: 'confirmed' }); expect(first.status).toBe(201);
    const overlap = await api().post('/api/reservations').send({ guestId, roomId, checkIn: '2025-10-23', checkOut: '2025-10-27', nightlyRateCents: 80000, status: 'confirmed' });
    expect(overlap.status).toBe(409); expect(overlap.body.error).toMatch(/non disponible/);
  });
  it('allows consecutive reservations (checkout day = next checkin day)', async () => {
    const { roomId, guestId } = await seedRoomAndGuest();
    const a = await api().post('/api/reservations').send({ guestId, roomId, checkIn: '2025-10-20', checkOut: '2025-10-25', nightlyRateCents: 80000, status: 'confirmed' });
    const b = await api().post('/api/reservations').send({ guestId, roomId, checkIn: '2025-10-25', checkOut: '2025-10-28', nightlyRateCents: 80000, status: 'confirmed' });
    expect(a.status).toBe(201); expect(b.status).toBe(201);
  });
  it('frees the room when a reservation is cancelled', async () => {
    const { roomId, guestId } = await seedRoomAndGuest();
    const a = await api().post('/api/reservations').send({ guestId, roomId, checkIn: '2025-10-20', checkOut: '2025-10-25', nightlyRateCents: 80000, status: 'confirmed' });
    const cancel = await api().post(`/api/reservations/${a.body.id}/cancel`); expect(cancel.status).toBe(200);
    const b = await api().post('/api/reservations').send({ guestId, roomId, checkIn: '2025-10-21', checkOut: '2025-10-23', nightlyRateCents: 80000, status: 'confirmed' }); expect(b.status).toBe(201);
  });
  it('rejects invalid dates (arrival after departure)', async () => {
    const { roomId, guestId } = await seedRoomAndGuest();
    const r = await api().post('/api/reservations').send({ guestId, roomId, checkIn: '2025-10-25', checkOut: '2025-10-20', nightlyRateCents: 80000 }); expect(r.status).toBe(400);
  });
});
describe('check-in / check-out full flow', () => {
  it('runs the whole pipeline and creates invoice + housekeeping task', async () => {
    const room = await api().post('/api/rooms').send({ number: '301', floor: 3, roomTypeId: null, status: 'available' });
    const guest = await api().post('/api/guests').send({ firstName: 'Flow', lastName: 'Test', phone: '0633333333', email: 'f@t.com' });
    const svc = await api().post('/api/services').send({ name: 'Petit-déjeuner', priceCents: 8000 });
    const resv = await api().post('/api/reservations').send({ guestId: guest.body.id, roomId: room.body.id, checkIn: today(), checkOut: addDays(today(), 2), nightlyRateCents: 80000, status: 'confirmed' });
    expect(resv.status).toBe(201);
    const ci = await api().post(`/api/reservations/${resv.body.id}/check-in`); expect(ci.status).toBe(200);
    const roomAfterCheckin = db.prepare('SELECT status FROM rooms WHERE id = ?').get(room.body.id); expect(roomAfterCheckin.status).toBe('occupied');
    const addSvc = await api().post(`/api/reservations/${resv.body.id}/services`).send({ serviceId: svc.body.id, quantity: 2 }); expect(addSvc.status).toBe(200);
    const pay = await api().post(`/api/reservations/${resv.body.id}/payments`).send({ amountCents: 100000, method: 'cash', reference: 'esp-001' }); expect(pay.status).toBe(201);
    const detail = await api().get(`/api/reservations/${resv.body.id}`);
    expect(detail.body.totals.totalCents).toBe(176000); expect(detail.body.totals.paidCents).toBe(100000); expect(detail.body.totals.balanceCents).toBe(76000);
    const co = await api().post(`/api/reservations/${resv.body.id}/check-out`); expect(co.status).toBe(200); expect(co.body.invoiceId).toBeTypeOf('number');
    const roomAfterCheckout = db.prepare('SELECT status FROM rooms WHERE id = ?').get(room.body.id); expect(roomAfterCheckout.status).toBe('dirty');
    const hk = db.prepare('SELECT COUNT(*) as c FROM housekeeping_tasks WHERE room_id = ? AND status = ?').get(room.body.id, 'pending'); expect(hk.c).toBe(1);
    const inv = await api().get(`/api/invoices/${co.body.invoiceId}`); expect(inv.body.invoice.total_cents).toBe(176000); expect(inv.body.invoice.paid_cents).toBe(100000);
    const print = await api().get(`/api/invoices/${co.body.invoiceId}/print`); expect(print.status).toBe(200); expect(print.text).toContain('FACTURE'); expect(print.text).toContain('176');
  });
});
describe('users & roles', () => {
  it('admin can create a reception user who cannot create other users', async () => {
    const created = await api().post('/api/users').send({ email: 'reception@test.local', fullName: 'Réception', password: 'password123', role: 'reception' }); expect(created.status).toBe(201);
    const login = await request(app).post('/api/auth/login').send({ email: 'reception@test.local', password: 'password123' }); expect(login.status).toBe(200);
    const receptionCookie = login.headers['set-cookie'][0].split(';')[0];
    const forbidden = await request(app).post('/api/users').set('Cookie', receptionCookie).send({ email: 'x@y.com', fullName: 'X Y', password: 'password123', role: 'admin' }); expect(forbidden.status).toBe(403);
    const listForbidden = await request(app).get('/api/users').set('Cookie', receptionCookie); expect(listForbidden.status).toBe(403);
  });
  it('admin cannot demote their own account', async () => {
    const users = await api().get('/api/users'); const admin = users.body.find((u: any) => u.role === 'admin');
    const r = await api().patch(`/api/users/${admin.id}`).send({ role: 'reception' }); expect(r.status).toBe(400);
  });
});
describe('reports/kpis', () => {
  it('returns occupancy, ADR, RevPAR from live data', async () => {
    const room = await api().post('/api/rooms').send({ number: '401', floor: 4, roomTypeId: null, status: 'available' });
    const guest = await api().post('/api/guests').send({ firstName: 'R', lastName: 'T', phone: '0644444444', email: 'r@t.com' });
    await api().post('/api/reservations').send({ guestId: guest.body.id, roomId: room.body.id, checkIn: '2025-10-20', checkOut: '2025-10-25', nightlyRateCents: 100000, status: 'confirmed' });
    const r = await api().get('/api/reports/kpis?from=2025-10-01&to=2025-10-31'); expect(r.status).toBe(200);
    expect(r.body.availableNights).toBe(31); expect(r.body.occupiedNights).toBe(5); expect(r.body.roomRevenueCents).toBe(500000);
    expect(r.body.adrCents).toBe(100000); expect(Math.round(r.body.revparCents)).toBe(16129); expect(r.body.occupancyRate).toBeCloseTo(16.13, 1);
  });
});