import express from 'express';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { db, tx, HttpError, audit } from './db.js';
import { hashPassword, verifyPassword, createSession, currentUser, requireAuth, requireRole } from './auth.js';
import { computeTotals, nightsBetween, addDays, overlapNights } from './money.js';

const ok = (res: any, data: any = null, status = 200) => res.status(status).json(data ?? { ok: true });
const fail = (res: any, err: unknown) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Données invalides', details: err.issues });
  console.error(err);
  return res.status(500).json({ error: 'Erreur interne du serveur' });
};
const wrap = (fn: (req: any, res: any) => any) => (req: any, res: any) => {
  try { return fn(req, res); } catch (e) { return fail(res, e); }
};

function assertRoomAvailable(roomId: number, checkIn: string, checkOut: string, excludeId?: number) {
  const conflict = db.prepare(`
    SELECT id, reference FROM reservations
    WHERE room_id = ? AND status IN ('pending','confirmed','in_progress')
      AND check_in < ? AND check_out > ?
      ${excludeId ? 'AND id <> ?' : ''}
    LIMIT 1
  `).get(...(excludeId ? [roomId, checkOut, checkIn, excludeId] : [roomId, checkOut, checkIn])) as any;
  if (conflict) throw new HttpError(409, `Chambre non disponible pour ces dates (réservation ${conflict.reference} en conflit)`);
  const room = db.prepare('SELECT status, active FROM rooms WHERE id = ?').get(roomId) as any;
  if (!room || !room.active) throw new HttpError(409, 'Chambre inactive');
  if (room.status === 'out_of_service') throw new HttpError(409, 'Chambre hors service');
}

function newReference(): string {
  const y = new Date().getFullYear();
  const n = (db.prepare(`SELECT COUNT(*) as c FROM reservations WHERE reference LIKE ?`).get(`RES-${y}-%`) as any).c + 1;
  return `RES-${y}-${String(n).padStart(4, '0')}`;
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/setup/status', wrap((_req, res) => {
    const c = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c as number;
    ok(res, { needsSetup: c === 0 });
  }));

  app.post('/api/setup', wrap((req, res) => {
    const body = z.object({
      fullName: z.string().min(2), email: z.string().email(),
      password: z.string().min(8), hotelName: z.string().min(2)
    }).parse(req.body);
    const count = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c as number;
    if (count > 0) throw new HttpError(409, 'Configuration déjà effectuée');
    const userId = tx(() => {
      const r = db.prepare('INSERT INTO users (email, password_hash, full_name, role) VALUES (?,?,?,?)')
        .run(body.email.toLowerCase(), hashPassword(body.password), body.fullName, 'admin');
      const uid = Number(r.lastInsertRowid);
      db.prepare('UPDATE settings SET hotel_name = ? WHERE id = 1').run(body.hotelName);
      return uid;
    });
    const token = createSession(userId);
    res.cookie('hotelyx_session', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
    audit(userId, 'setup', 'system', null, { email: body.email });
    ok(res);
  }));

  app.post('/api/auth/login', wrap((req, res) => {
    const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email.toLowerCase()) as any;
    if (!user || !verifyPassword(password, user.password_hash)) throw new HttpError(401, 'Identifiants invalides');
    const token = createSession(user.id);
    res.cookie('hotelyx_session', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
    audit(user.id, 'login', 'user', user.id);
    ok(res, { user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role } });
  }));

  app.post('/api/auth/logout', wrap((req, res) => {
    const token = (req as any).cookies?.hotelyx_session;
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie('hotelyx_session');
    ok(res);
  }));

  app.get('/api/auth/me', wrap((req, res) => {
    const u = currentUser(req);
    ok(res, { user: u ? { id: u.id, email: u.email, fullName: u.full_name, role: u.role } : null });
  }));

  app.get('/api/users', requireAuth, requireRole('admin', 'manager'), wrap((_req, res) => {
    ok(res, db.prepare('SELECT id, email, full_name, role, active, created_at FROM users ORDER BY id').all());
  }));

  app.post('/api/users', requireAuth, requireRole('admin'), wrap((req, res) => {
    const b = z.object({
      email: z.string().email(), fullName: z.string().min(2), password: z.string().min(8),
      role: z.enum(['admin', 'manager', 'reception', 'housekeeping', 'accountant', 'maintenance'])
    }).parse(req.body);
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(b.email.toLowerCase());
    if (exists) throw new HttpError(409, 'Cet email existe déjà');
    const r = db.prepare('INSERT INTO users (email, password_hash, full_name, role) VALUES (?,?,?,?)')
      .run(b.email.toLowerCase(), hashPassword(b.password), b.fullName, b.role);
    audit((req as any).user.id, 'user.create', 'user', Number(r.lastInsertRowid), { email: b.email, role: b.role });
    ok(res, { id: Number(r.lastInsertRowid) }, 201);
  }));

  app.patch('/api/users/:id', requireAuth, requireRole('admin'), wrap((req, res) => {
    const id = Number(req.params.id);
    const self = (req as any).user.id as number;
    const b = z.object({
      active: z.boolean().optional(),
      role: z.enum(['admin', 'manager', 'reception', 'housekeeping', 'accountant', 'maintenance']).optional()
    }).parse(req.body);
    if (id === self && (b.active === false || (b.role && b.role !== 'admin'))) {
      throw new HttpError(400, 'Impossible de désactiver ou rétrograder votre propre compte');
    }
    const cur = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!cur) throw new HttpError(404, 'Utilisateur introuvable');
    db.prepare('UPDATE users SET active = ?, role = ? WHERE id = ?')
      .run(b.active === undefined ? cur.active : (b.active ? 1 : 0), b.role ?? cur.role, id);
    audit(self, 'user.update', 'user', id, b);
    ok(res);
  }));

  app.get('/api/room-types', requireAuth, wrap((_req, res) => {
    ok(res, db.prepare('SELECT * FROM room_types ORDER BY name').all());
  }));
  app.post('/api/room-types', requireAuth, requireRole('manager', 'admin'), wrap((req, res) => {
    const b = z.object({
      name: z.string().min(1), description: z.string().default(''),
      capacity: z.number().int().min(1), basePriceCents: z.number().int().min(0)
    }).parse(req.body);
    const r = db.prepare('INSERT INTO room_types (name, description, capacity, base_price_cents) VALUES (?,?,?,?)')
      .run(b.name, b.description, b.capacity, b.basePriceCents);
    ok(res, { id: Number(r.lastInsertRowid) }, 201);
  }));

  app.get('/api/rooms', requireAuth, wrap((req, res) => {
    const status = req.query.status as string | undefined;
    const rows = status
      ? db.prepare('SELECT r.*, rt.name as room_type_name FROM rooms r LEFT JOIN room_types rt ON rt.id = r.room_type_id WHERE r.status = ? AND r.active = 1 ORDER BY r.number').all(status)
      : db.prepare('SELECT r.*, rt.name as room_type_name FROM rooms r LEFT JOIN room_types rt ON rt.id = r.room_type_id WHERE r.active = 1 ORDER BY r.number').all();
    ok(res, rows);
  }));
  const roomSchema = z.object({
    number: z.string().min(1), floor: z.number().int().default(0),
    roomTypeId: z.number().int().nullable(),
    status: z.enum(['available', 'occupied', 'dirty', 'cleaning', 'inspected', 'out_of_service']).default('available'),
    notes: z.string().default('')
  });
  app.post('/api/rooms', requireAuth, requireRole('manager', 'admin', 'reception'), wrap((req, res) => {
    const b = roomSchema.parse(req.body);
    const r = db.prepare('INSERT INTO rooms (number, floor, room_type_id, status, notes) VALUES (?,?,?,?,?)')
      .run(b.number, b.floor, b.roomTypeId, b.status, b.notes);
    audit((req as any).user.id, 'room.create', 'room', Number(r.lastInsertRowid));
    ok(res, { id: Number(r.lastInsertRowid) }, 201);
  }));
  app.patch('/api/rooms/:id', requireAuth, requireRole('manager', 'admin', 'reception', 'housekeeping', 'maintenance'), wrap((req, res) => {
    const id = Number(req.params.id);
    const b = roomSchema.partial().parse(req.body);
    const current = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as any;
    if (!current) throw new HttpError(404, 'Chambre introuvable');
    db.prepare('UPDATE rooms SET number=?, floor=?, room_type_id=?, status=?, notes=? WHERE id=?').run(
      b.number ?? current.number, b.floor ?? current.floor,
      b.roomTypeId !== undefined ? b.roomTypeId : current.room_type_id,
      b.status ?? current.status, b.notes ?? current.notes, id
    );
    audit((req as any).user.id, 'room.update', 'room', id, b);
    ok(res);
  }));
  app.delete('/api/rooms/:id', requireAuth, requireRole('manager', 'admin'), wrap((req, res) => {
    const id = Number(req.params.id);
    const resv = db.prepare('SELECT COUNT(*) as c FROM reservations WHERE room_id = ?').get(id) as any;
    if (resv.c > 0) throw new HttpError(409, 'Impossible de supprimer : réservations existantes');
    db.prepare('UPDATE rooms SET active = 0 WHERE id = ?').run(id);
    audit((req as any).user.id, 'room.deactivate', 'room', id);
    ok(res);
  }));

  app.get('/api/guests', requireAuth, wrap((req, res) => {
    const q = `%${String(req.query.q ?? '').trim()}%`;
    ok(res, db.prepare('SELECT * FROM guests WHERE first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT 500')
      .all(q, q, q, q));
  }));
  const guestSchema = z.object({
    firstName: z.string().min(1), lastName: z.string().min(1),
    phone: z.string().default(''), email: z.string().default(''),
    country: z.string().default(''), address: z.string().default(''), notes: z.string().default('')
  });
  app.post('/api/guests', requireAuth, wrap((req, res) => {
    const b = guestSchema.parse(req.body);
    const dup = db.prepare('SELECT id FROM guests WHERE lower(first_name)=lower(?) AND lower(last_name)=lower(?) AND phone=? LIMIT 1')
      .get(b.firstName, b.lastName, b.phone);
    if (dup) throw new HttpError(409, 'Un client similaire existe déjà');
    const r = db.prepare('INSERT INTO guests (first_name,last_name,phone,email,country,address,notes) VALUES (?,?,?,?,?,?,?)')
      .run(b.firstName, b.lastName, b.phone, b.email, b.country, b.address, b.notes);
    ok(res, { id: Number(r.lastInsertRowid) }, 201);
  }));
  app.patch('/api/guests/:id', requireAuth, wrap((req, res) => {
    const id = Number(req.params.id);
    const b = guestSchema.partial().parse(req.body);
    const cur = db.prepare('SELECT * FROM guests WHERE id = ?').get(id) as any;
    if (!cur) throw new HttpError(404, 'Client introuvable');
    db.prepare('UPDATE guests SET first_name=?,last_name=?,phone=?,email=?,country=?,address=?,notes=? WHERE id=?').run(
      b.firstName ?? cur.first_name, b.lastName ?? cur.last_name, b.phone ?? cur.phone,
      b.email ?? cur.email, b.country ?? cur.country, b.address ?? cur.address, b.notes ?? cur.notes, id);
    ok(res);
  }));
  app.get('/api/guests/:id', requireAuth, wrap((req, res) => {
    const id = Number(req.params.id);
    const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(id) as any;
    if (!guest) throw new HttpError(404, 'Client introuvable');
    const reservations = db.prepare(`
      SELECT r.*, rm.number as room_number FROM reservations r
      JOIN rooms rm ON rm.id = r.room_id WHERE r.guest_id = ? ORDER BY r.check_in DESC`).all(id);
    ok(res, { guest, reservations });
  }));

  app.get('/api/services', requireAuth, wrap((_req, res) => {
    ok(res, db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY name').all());
  }));
  app.post('/api/services', requireAuth, requireRole('manager', 'admin'), wrap((req, res) => {
    const b = z.object({ name: z.string().min(1), priceCents: z.number().int().min(0) }).parse(req.body);
    const r = db.prepare('INSERT INTO services (name, price_cents) VALUES (?,?)').run(b.name, b.priceCents);
    ok(res, { id: Number(r.lastInsertRowid) }, 201);
  }));
  app.delete('/api/services/:id', requireAuth, requireRole('manager', 'admin'), wrap((req, res) => {
    db.prepare('UPDATE services SET active = 0 WHERE id = ?').run(Number(req.params.id));
    ok(res);
  }));

  app.get('/api/settings', requireAuth, wrap((_req, res) => {
    ok(res, db.prepare('SELECT * FROM settings WHERE id = 1').get());
  }));
  app.patch('/api/settings', requireAuth, requireRole('manager', 'admin'), wrap((req, res) => {
    const b = z.object({
      hotelName: z.string().min(1).optional(), address: z.string().optional(), phone: z.string().optional(),
      email: z.string().optional(), website: z.string().optional(), currency: z.string().optional(),
      checkInTime: z.string().optional(), checkOutTime: z.string().optional(),
      taxRateBp: z.number().int().min(0).max(10000).optional(),
      invoicePrefix: z.string().optional()
    }).parse(req.body);
    const cur = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
    db.prepare(`UPDATE settings SET hotel_name=?, address=?, phone=?, email=?, website=?, currency=?,
      check_in_time=?, check_out_time=?, tax_rate_bp=?, invoice_prefix=? WHERE id = 1`)
      .run(b.hotelName ?? cur.hotel_name, b.address ?? cur.address, b.phone ?? cur.phone, b.email ?? cur.email,
        b.website ?? cur.website, b.currency ?? cur.currency, b.checkInTime ?? cur.check_in_time,
        b.checkOutTime ?? cur.check_out_time, b.taxRateBp ?? cur.tax_rate_bp, b.invoicePrefix ?? cur.invoice_prefix);
    audit((req as any).user.id, 'settings.update', 'settings', 1, b);
    ok(res);
  }));

  const resvSchema = z.object({
    guestId: z.number().int(), roomId: z.number().int(),
    checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    adults: z.number().int().min(1).default(1),
    children: z.number().int().min(0).default(0),
    nightlyRateCents: z.number().int().min(0),
    discountCents: z.number().int().min(0).default(0),
    notes: z.string().default(''),
    status: z.enum(['pending', 'confirmed']).default('pending')
  });

  app.get('/api/reservations', requireAuth, wrap((req, res) => {
    const q = String(req.query.q ?? '').trim();
    const status = req.query.status as string | undefined;
    const where: string[] = []; const args: any[] = [];
    if (status) { where.push('r.status = ?'); args.push(status); }
    if (q) { where.push('(r.reference LIKE ? OR g.first_name LIKE ? OR g.last_name LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const sql = `SELECT r.*, g.first_name, g.last_name, rm.number as room_number
      FROM reservations r JOIN guests g ON g.id = r.guest_id JOIN rooms rm ON rm.id = r.room_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.check_in DESC LIMIT 500`;
    ok(res, db.prepare(sql).all(...args));
  }));

  app.post('/api/reservations', requireAuth, requireRole('reception', 'manager', 'admin'), wrap((req, res) => {
    const b = resvSchema.parse(req.body);
    if (nightsBetween(b.checkIn, b.checkOut) <= 0) throw new HttpError(400, 'Dates invalides : l\'arrivée doit précéder le départ');
    const id = tx(() => {
      assertRoomAvailable(b.roomId, b.checkIn, b.checkOut);
      const r = db.prepare(`INSERT INTO reservations (reference, guest_id, room_id, check_in, check_out, adults, children,
        status, nightly_rate_cents, discount_cents, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(newReference(), b.guestId, b.roomId, b.checkIn, b.checkOut, b.adults, b.children,
          b.status, b.nightlyRateCents, b.discountCents, b.notes, (req as any).user.id);
      const newId = Number(r.lastInsertRowid);
      audit((req as any).user.id, 'reservation.create', 'reservation', newId, { roomId: b.roomId });
      return newId;
    });
    ok(res, { id }, 201);
  }));

  app.patch('/api/reservations/:id', requireAuth, requireRole('reception', 'manager', 'admin'), wrap((req, res) => {
    const id = Number(req.params.id);
    const cur = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as any;
    if (!cur) throw new HttpError(404, 'Réservation introuvable');
    if (['completed', 'cancelled'].includes(cur.status)) throw new HttpError(409, 'Réservation clôturée');
    const b = resvSchema.partial().parse(req.body);
    tx(() => {
      if (b.roomId || b.checkIn || b.checkOut) {
        assertRoomAvailable(b.roomId ?? cur.room_id, b.checkIn ?? cur.check_in, b.checkOut ?? cur.check_out, id);
      }
      db.prepare(`UPDATE reservations SET guest_id=?, room_id=?, check_in=?, check_out=?, adults=?, children=?,
        status=?, nightly_rate_cents=?, discount_cents=?, notes=?, updated_at=datetime('now') WHERE id=?`)
        .run(b.guestId ?? cur.guest_id, b.roomId ?? cur.room_id, b.checkIn ?? cur.check_in, b.checkOut ?? cur.check_out,
          b.adults ?? cur.adults, b.children ?? cur.children, b.status ?? cur.status,
          b.nightlyRateCents ?? cur.nightly_rate_cents, b.discountCents ?? cur.discount_cents, b.notes ?? cur.notes, id);
    });
    ok(res);
  }));

  app.post('/api/reservations/:id/cancel', requireAuth, requireRole('reception', 'manager', 'admin'), wrap((req, res) => {
    const id = Number(req.params.id);
    const cur = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as any;
    if (!cur) throw new HttpError(404, 'Réservation introuvable');
    if (cur.status === 'completed') throw new HttpError(409, 'Réservation terminée : annulation impossible');
    if (cur.status === 'cancelled') throw new HttpError(409, 'Déjà annulée');
    db.prepare(`UPDATE reservations SET status='cancelled', updated_at=datetime('now') WHERE id=?`).run(id);
    audit((req as any).user.id, 'reservation.cancel', 'reservation', id);
    ok(res);
  }));

  app.post('/api/reservations/:id/confirm', requireAuth, requireRole('reception', 'manager', 'admin'), wrap((req, res) => {
    const id = Number(req.params.id);
    const cur = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as any;
    if (!cur) throw new HttpError(404, 'Réservation introuvable');
    if (cur.status !== 'pending') throw new HttpError(409, 'Transition invalide');
    tx(() => {
      assertRoomAvailable(cur.room_id, cur.check_in, cur.check_out, id);
      db.prepare(`UPDATE reservations SET status='confirmed', updated_at=datetime('now') WHERE id=?`).run(id);
      audit((req as any).user.id, 'reservation.confirm', 'reservation', id);
    });
    ok(res);
  }));

  app.get('/api/reservations/:id', requireAuth, wrap((req, res) => {
    const id = Number(req.params.id);
    const r = db.prepare(`
      SELECT r.*, g.first_name, g.last_name, g.phone as guest_phone, g.email as guest_email, rm.number as room_number
      FROM reservations r JOIN guests g ON g.id = r.guest_id JOIN rooms rm ON rm.id = r.room_id WHERE r.id = ?`).get(id) as any;
    if (!r) throw new HttpError(404, 'Réservation introuvable');
    const services = db.prepare('SELECT * FROM reservation_services WHERE reservation_id = ?').all(id);
    const payments = db.prepare('SELECT * FROM payments WHERE reservation_id = ? ORDER BY paid_at').all(id);
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
    const totals = computeTotals(r, services as any, payments as any, settings.tax_rate_bp);
    const invoice = db.prepare('SELECT * FROM invoices WHERE reservation_id = ? ORDER BY id DESC LIMIT 1').get(id);
    ok(res, { reservation: r, services, payments, totals, invoice });
  }));

  app.post('/api/reservations/:id/check-in', requireAuth, requireRole('reception', 'manager', 'admin'), wrap((req, res) => {
    const id = Number(req.params.id);
    tx(() => {
      const r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as any;
      if (!r) throw new HttpError(404, 'Réservation introuvable');
      if (!['confirmed', 'pending'].includes(r.status)) throw new HttpError(409, 'Statut de réservation incompatible');
      const today = new Date().toISOString().slice(0, 10);
      if (r.check_in > today) throw new HttpError(409, 'Arrivée prévue dans le futur');
      assertRoomAvailable(r.room_id, r.check_in, r.check_out, id);
      const room = db.prepare('SELECT status FROM rooms WHERE id = ?').get(r.room_id) as any;
      if (!['available', 'inspected'].includes(room.status)) throw new HttpError(409, `Chambre non prête (statut : ${room.status})`);
      db.prepare(`UPDATE reservations SET status='in_progress', updated_at=datetime('now') WHERE id=?`).run(id);
      db.prepare(`UPDATE rooms SET status='occupied' WHERE id=?`).run(r.room_id);
      audit((req as any).user.id, 'reservation.checkin', 'reservation', id);
    });
    ok(res);
  }));

  app.post('/api/reservations/:id/check-out', requireAuth, requireRole('reception', 'manager', 'admin'), wrap((req, res) => {
    const id = Number(req.params.id);
    const invoiceId = tx(() => {
      const r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id) as any;
      if (!r) throw new HttpError(404, 'Réservation introuvable');
      if (r.status !== 'in_progress') throw new HttpError(409, 'La réservation n\'est pas en cours');
      const services = db.prepare('SELECT * FROM reservation_services WHERE reservation_id = ?').all(id) as any[];
      const payments = db.prepare('SELECT * FROM payments WHERE reservation_id = ?').all(id) as any[];
      const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
      const t = computeTotals(r, services, payments, settings.tax_rate_bp);
      const seq = settings.invoice_next_seq;
      const number = `${settings.invoice_prefix}-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`;
      const inv = db.prepare('INSERT INTO invoices (number, reservation_id, total_cents, tax_cents, paid_cents) VALUES (?,?,?,?,?)')
        .run(number, id, t.totalCents, t.taxCents, t.paidCents);
      db.prepare('UPDATE settings SET invoice_next_seq = invoice_next_seq + 1 WHERE id = 1').run();
      db.prepare(`UPDATE reservations SET status='completed', updated_at=datetime('now') WHERE id=?`).run(id);
      db.prepare(`UPDATE rooms SET status='dirty' WHERE id=?`).run(r.room_id);
      const existing = db.prepare(`SELECT id FROM housekeeping_tasks WHERE reservation_id = ? AND status <> 'inspected'`).get(id);
      if (!existing) {
        db.prepare(`INSERT INTO housekeeping_tasks (room_id, reservation_id, status, priority) VALUES (?, ?, 'pending', 'normal')`)
          .run(r.room_id, id);
      }
      audit((req as any).user.id, 'reservation.checkout', 'reservation', id, { invoiceNumber: number });
      return Number(inv.lastInsertRowid);
    });
    ok(res, { invoiceId });
  }));

  app.post('/api/reservations/:id/services', requireAuth, requireRole('reception', 'manager', 'admin'), wrap((req, res) => {
    const id = Number(req.params.id);
    const b = z.object({ serviceId: z.number().int(), quantity: z.number().int().min(1).default(1) }).parse(req.body);
    const r = db.prepare('SELECT status FROM reservations WHERE id = ?').get(id) as any;
    if (!r) throw new HttpError(404, 'Réservation introuvable');
    if (!['confirmed', 'in_progress'].includes(r.status)) throw new HttpError(409, 'Réservation clôturée');
    const svc = db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(b.serviceId) as any;
    if (!svc) throw new HttpError(404, 'Service introuvable');
    db.prepare('INSERT INTO reservation_services (reservation_id, service_id, name, quantity, unit_price_cents) VALUES (?,?,?,?,?)')
      .run(id, svc.id, svc.name, b.quantity, svc.price_cents);
    ok(res);
  }));

  app.post('/api/reservations/:id/payments', requireAuth, requireRole('reception', 'manager', 'admin', 'accountant'), wrap((req, res) => {
    const id = Number(req.params.id);
    const b = z.object({
      amountCents: z.number().int().positive(),
      method: z.enum(['cash', 'card', 'transfer', 'other']),
      reference: z.string().default('')
    }).parse(req.body);
    const r = db.prepare('SELECT status FROM reservations WHERE id = ?').get(id) as any;
    if (!r) throw new HttpError(404, 'Réservation introuvable');
    if (r.status === 'cancelled') throw new HttpError(409, 'Réservation annulée');
    const p = db.prepare('INSERT INTO payments (reservation_id, amount_cents, method, reference, created_by) VALUES (?,?,?,?,?)')
      .run(id, b.amountCents, b.method, b.reference, (req as any).user.id);
    audit((req as any).user.id, 'payment.create', 'payment', Number(p.lastInsertRowid), { reservationId: id });
    ok(res, { id: Number(p.lastInsertRowid) }, 201);
  }));

  app.get('/api/invoices/:id', requireAuth, wrap((req, res) => {
    const id = Number(req.params.id);
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
    if (!inv) throw new HttpError(404, 'Facture introuvable');
    const r = db.prepare(`
      SELECT r.*, g.first_name, g.last_name, g.phone as guest_phone, g.email as guest_email, rm.number as room_number
      FROM reservations r JOIN guests g ON g.id = r.guest_id JOIN rooms rm ON rm.id = r.room_id WHERE r.id = ?`).get(inv.reservation_id) as any;
    const services = db.prepare('SELECT * FROM reservation_services WHERE reservation_id = ?').all(inv.reservation_id);
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    ok(res, { invoice: inv, reservation: r, services, settings });
  }));

  app.get('/api/invoices/:id/print', requireAuth, wrap((req, res) => {
    const id = Number(req.params.id);
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
    if (!inv) throw new HttpError(404, 'Facture introuvable');
    const r = db.prepare(`
      SELECT r.*, g.first_name, g.last_name, g.phone as guest_phone, g.email as guest_email, rm.number as room_number
      FROM reservations r JOIN guests g ON g.id = r.guest_id JOIN rooms rm ON rm.id = r.room_id WHERE r.id = ?`).get(inv.reservation_id) as any;
    const services = db.prepare('SELECT * FROM reservation_services WHERE reservation_id = ?').all(inv.reservation_id) as any[];
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
    const nights = nightsBetween(r.check_in, r.check_out);
    const roomCharge = nights * r.nightly_rate_cents - r.discount_cents;
    const servicesTotal = services.reduce((s, x) => s + x.quantity * x.unit_price_cents, 0);
    const subtotal = roomCharge + servicesTotal;
    const taxRate = settings.tax_rate_bp / 100;
    const mad = (c: number) => new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD' }).format(c / 100);
    const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Facture ${esc(inv.number)}</title>
    <style>
      @page { size: A4; margin: 18mm; }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0B1B2B; font-size: 12px; }
      h1 { font-size: 26px; margin: 0; }
      .muted { color: #666; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #C9A227; padding-bottom: 16px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; }
      th { background: #0B1B2B; color: #fff; font-size: 11px; text-transform: uppercase; }
      td.r, th.r { text-align: right; }
      .totals { width: 45%; margin-left: auto; }
      .totals tr td { border: none; padding: 4px 8px; }
      .totals tr.grand { font-weight: bold; font-size: 14px; border-top: 2px solid #0B1B2B; }
      .no-print { text-align: center; margin: 24px 0; }
      @media print { .no-print { display: none; } }
    </style></head><body>
      <div class="no-print">
        <button onclick="window.print()" style="padding:10px 20px;font-size:14px;background:#0B1B2B;color:#fff;border:none;border-radius:6px;cursor:pointer">Imprimer / Enregistrer en PDF</button>
      </div>
      <div class="header">
        <div>
          <h1>${esc(settings.hotel_name)}</h1>
          <div class="muted">${esc(settings.address)}</div>
          <div class="muted">${esc(settings.phone)} · ${esc(settings.email)}</div>
          <div class="muted">${esc(settings.website)}</div>
        </div>
        <div style="text-align:right">
          <h1 style="color:#C9A227">FACTURE</h1>
          <div><b>${esc(inv.number)}</b></div>
          <div class="muted">Émise le ${new Date(inv.issued_at).toLocaleDateString('fr-FR')}</div>
        </div>
      </div>
      <div class="grid">
        <div>
          <div class="muted" style="text-transform:uppercase;font-size:10px;margin-bottom:4px">Client</div>
          <div><b>${esc(r.first_name)} ${esc(r.last_name)}</b></div>
          <div>${esc(r.guest_phone)}</div>
          <div>${esc(r.guest_email)}</div>
        </div>
        <div style="text-align:right">
          <div class="muted" style="text-transform:uppercase;font-size:10px;margin-bottom:4px">Séjour</div>
          <div>Réf. réservation : <b>${esc(r.reference)}</b></div>
          <div>Chambre ${esc(r.room_number)}</div>
          <div>Du ${esc(r.check_in)} au ${esc(r.check_out)} (${nights} nuit${nights > 1 ? 's' : ''})</div>
        </div>
      </div>
      <table>
        <thead><tr><th>Description</th><th class="r">Qté</th><th class="r">Prix unitaire</th><th class="r">Total</th></tr></thead>
        <tbody>
          <tr><td>Hébergement — chambre ${esc(r.room_number)}</td><td class="r">${nights}</td>
              <td class="r">${mad(r.nightly_rate_cents)}</td><td class="r">${mad(nights * r.nightly_rate_cents)}</td></tr>
          ${r.discount_cents > 0 ? `<tr><td colspan="3" class="r">Remise</td><td class="r">-${mad(r.discount_cents)}</td></tr>` : ''}
          ${services.map(s => `<tr><td>${esc(s.name)}</td><td class="r">${s.quantity}</td>
              <td class="r">${mad(s.unit_price_cents)}</td><td class="r">${mad(s.quantity * s.unit_price_cents)}</td></tr>`).join('')}
        </tbody>
      </table>
      <table class="totals">
        <tr><td>Sous-total</td><td class="r">${mad(subtotal)}</td></tr>
        <tr><td>TVA (${taxRate.toFixed(2)}%)</td><td class="r">${mad(inv.tax_cents)}</td></tr>
        <tr class="grand"><td>Total</td><td class="r">${mad(inv.total_cents)}</td></tr>
        <tr><td>Déjà payé</td><td class="r">${mad(inv.paid_cents)}</td></tr>
        <tr class="grand"><td>Solde restant</td><td class="r">${mad(inv.total_cents - inv.paid_cents)}</td></tr>
      </table>
      <p class="muted" style="margin-top:40px;font-size:10px;border-top:1px solid #eee;padding-top:12px">
        Facture générée par Hotelyx. Les taux de TVA et la conformité fiscale doivent être vérifiés par votre comptable.
        Ce document n'est pas certifié conforme à la réglementation marocaine avant validation professionnelle.
      </p>
    </body></html>`;
    res.set('Content-Type', 'text/html; charset=utf-8').send(html);
  }));

  app.get('/api/housekeeping', requireAuth, wrap((_req, res) => {
    ok(res, db.prepare(`
      SELECT h.*, rm.number as room_number, u.full_name as assignee
      FROM housekeeping_tasks h JOIN rooms rm ON rm.id = h.room_id
      LEFT JOIN users u ON u.id = h.assigned_to
      ORDER BY CASE h.status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, h.id DESC LIMIT 200`).all());
  }));
  app.patch('/api/housekeeping/:id', requireAuth, requireRole('housekeeping', 'manager', 'admin', 'reception'), wrap((req, res) => {
    const id = Number(req.params.id);
    const b = z.object({
      status: z.enum(['pending', 'in_progress', 'done', 'inspected']).optional(),
      assignedTo: z.number().int().nullable().optional(),
      priority: z.enum(['low', 'normal', 'high']).optional()
    }).parse(req.body);
    const t = db.prepare('SELECT * FROM housekeeping_tasks WHERE id = ?').get(id) as any;
    if (!t) throw new HttpError(404, 'Tâche introuvable');
    tx(() => {
      db.prepare('UPDATE housekeeping_tasks SET status=?, assigned_to=?, priority=?, completed_at=? WHERE id=?')
        .run(b.status ?? t.status, b.assignedTo !== undefined ? b.assignedTo : t.assigned_to, b.priority ?? t.priority,
          (b.status === 'done' || b.status === 'inspected') ? new Date().toISOString() : t.completed_at, id);
      if (b.status === 'in_progress') db.prepare(`UPDATE rooms SET status='cleaning' WHERE id = ?`).run(t.room_id);
      if (b.status === 'inspected') db.prepare(`UPDATE rooms SET status='available' WHERE id = ? AND status <> 'out_of_service'`).run(t.room_id);
      audit((req as any).user.id, 'housekeeping.update', 'housekeeping_task', id, b);
    });
    ok(res);
  }));

  app.get('/api/maintenance', requireAuth, wrap((_req, res) => {
    ok(res, db.prepare(`
      SELECT m.*, rm.number as room_number, u.full_name as assignee
      FROM maintenance_tickets m JOIN rooms rm ON rm.id = m.room_id
      LEFT JOIN users u ON u.id = m.assigned_to ORDER BY m.id DESC LIMIT 200`).all());
  }));
  app.post('/api/maintenance', requireAuth, wrap((req, res) => {
    const b = z.object({
      roomId: z.number().int(), category: z.string().min(1), description: z.string().min(1),
      priority: z.enum(['low', 'normal', 'high']).default('normal'), markOutOfService: z.boolean().default(false)
    }).parse(req.body);
    const ticketId = tx(() => {
      const r = db.prepare('INSERT INTO maintenance_tickets (room_id, category, description, priority) VALUES (?,?,?,?)')
        .run(b.roomId, b.category, b.description, b.priority);
      if (b.markOutOfService) db.prepare(`UPDATE rooms SET status='out_of_service' WHERE id=?`).run(b.roomId);
      return Number(r.lastInsertRowid);
    });
    ok(res, { id: ticketId }, 201);
  }));
  app.patch('/api/maintenance/:id', requireAuth, requireRole('maintenance', 'manager', 'admin'), wrap((req, res) => {
    const id = Number(req.params.id);
    const b = z.object({
      status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
      assignedTo: z.number().int().nullable().optional(),
      priority: z.enum(['low', 'normal', 'high']).optional()
    }).parse(req.body);
    const t = db.prepare('SELECT * FROM maintenance_tickets WHERE id = ?').get(id) as any;
    if (!t) throw new HttpError(404, 'Ticket introuvable');
    db.prepare('UPDATE maintenance_tickets SET status=?, assigned_to=?, priority=?, resolved_at=? WHERE id=?')
      .run(b.status ?? t.status, b.assignedTo !== undefined ? b.assignedTo : t.assigned_to,
        b.priority ?? t.priority, (b.status === 'resolved' || b.status === 'closed') ? new Date().toISOString() : t.resolved_at, id);
    ok(res);
  }));

  app.get('/api/dashboard', requireAuth, wrap((_req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const rooms = db.prepare('SELECT status, COUNT(*) as c FROM rooms WHERE active = 1 GROUP BY status').all() as any[];
    const byStatus: Record<string, number> = {};
    rooms.forEach(r => { byStatus[r.status] = r.c; });
    const totalRooms = rooms.reduce((s, r) => s + r.c, 0);
    const oos = byStatus['out_of_service'] ?? 0;
    const occupied = byStatus['occupied'] ?? 0;
    const occupancyRate = totalRooms > oos ? Math.round((occupied / (totalRooms - oos)) * 100) : 0;

    const arrivalsToday = db.prepare(`
      SELECT r.*, g.first_name, g.last_name, rm.number as room_number
      FROM reservations r JOIN guests g ON g.id = r.guest_id JOIN rooms rm ON rm.id = r.room_id
      WHERE r.check_in = ? AND r.status IN ('pending','confirmed') ORDER BY r.id`).all(today);
    const departuresToday = db.prepare(`
      SELECT r.*, g.first_name, g.last_name, rm.number as room_number
      FROM reservations r JOIN guests g ON g.id = r.guest_id JOIN rooms rm ON rm.id = r.room_id
      WHERE r.check_out = ? AND r.status = 'in_progress' ORDER BY r.id`).all(today);
    const todayRev = (db.prepare(`SELECT COALESCE(SUM(amount_cents),0) as s FROM payments WHERE date(paid_at) = ?`).get(today) as any).s;
    const monthRev = (db.prepare(`SELECT COALESCE(SUM(amount_cents),0) as s FROM payments WHERE strftime('%Y-%m', paid_at) = strftime('%Y-%m','now')`).get() as any).s;
    const settings = db.prepare('SELECT tax_rate_bp FROM settings WHERE id = 1').get() as any;
    const active = db.prepare(`SELECT * FROM reservations WHERE status IN ('pending','confirmed','in_progress')`).all() as any[];
    let outstanding = 0;
    for (const r of active) {
      const svcs = db.prepare('SELECT * FROM reservation_services WHERE reservation_id = ?').all(r.id) as any[];
      const pays = db.prepare('SELECT * FROM payments WHERE reservation_id = ?').all(r.id) as any[];
      outstanding += Math.max(0, computeTotals(r, svcs, pays, settings.tax_rate_bp).balanceCents);
    }
    const recentReservations = db.prepare(`
      SELECT r.id, r.reference, r.check_in, r.check_out, r.status, g.first_name, g.last_name, rm.number as room_number
      FROM reservations r JOIN guests g ON g.id = r.guest_id JOIN rooms rm ON rm.id = r.room_id
      ORDER BY r.id DESC LIMIT 8`).all();
    const revenueChart = db.prepare(`
      SELECT date(paid_at) as d, SUM(amount_cents) as cents
      FROM payments WHERE paid_at >= date('now','-29 days') GROUP BY d ORDER BY d`).all();
    ok(res, {
      kpis: {
        totalRooms, occupied, available: byStatus['available'] ?? 0,
        dirty: byStatus['dirty'] ?? 0, cleaning: byStatus['cleaning'] ?? 0, inspected: byStatus['inspected'] ?? 0,
        outOfService: oos, arrivalsToday: arrivalsToday.length, departuresToday: departuresToday.length,
        todayRevenueCents: todayRev, monthRevenueCents: monthRev, outstandingCents: outstanding, occupancyRate
      },
      arrivalsToday, departuresToday, recentReservations, revenueChart
    });
  }));

  app.get('/api/calendar', requireAuth, wrap((req, res) => {
    const from = String(req.query.from ?? new Date().toISOString().slice(0, 10));
    const to = String(req.query.to ?? addDays(from, 13));
    const rooms = db.prepare('SELECT id, number, status FROM rooms WHERE active = 1 ORDER BY number').all();
    const reservations = db.prepare(`
      SELECT r.id, r.reference, r.room_id, r.check_in, r.check_out, r.status, r.guest_id,
             g.first_name || ' ' || g.last_name as guest_name
      FROM reservations r JOIN guests g ON g.id = r.guest_id
      WHERE r.status IN ('pending','confirmed','in_progress','completed')
        AND r.check_in < ? AND r.check_out > ?
      ORDER BY r.check_in`).all(addDays(to, 1), from);
    ok(res, { rooms, reservations, from, to });
  }));

  app.get('/api/reports/revenue', requireAuth, requireRole('manager', 'admin', 'accountant'), wrap((req, res) => {
    const from = String(req.query.from ?? new Date().toISOString().slice(0, 10));
    const to = String(req.query.to ?? from);
    ok(res, db.prepare(`SELECT date(paid_at) as date, method, SUM(amount_cents) as cents, COUNT(*) as count
      FROM payments WHERE date(paid_at) BETWEEN ? AND ? GROUP BY date, method ORDER BY date`).all(from, to));
  }));

  app.get('/api/reports/outstanding', requireAuth, requireRole('manager', 'admin', 'accountant'), wrap((_req, res) => {
    const settings = db.prepare('SELECT tax_rate_bp FROM settings WHERE id = 1').get() as any;
    const rows = db.prepare(`SELECT r.id, r.reference, r.status, g.first_name, g.last_name
      FROM reservations r JOIN guests g ON g.id = r.guest_id
      WHERE r.status IN ('pending','confirmed','in_progress')`).all() as any[];
    const out = rows.map(r => {
      const full = db.prepare('SELECT * FROM reservations WHERE id=?').get(r.id) as any;
      const svcs = db.prepare('SELECT * FROM reservation_services WHERE reservation_id = ?').all(r.id) as any[];
      const pays = db.prepare('SELECT * FROM payments WHERE reservation_id = ?').all(r.id) as any[];
      const t = computeTotals(full, svcs, pays, settings.tax_rate_bp);
      return { ...r, totalCents: t.totalCents, paidCents: t.paidCents, balanceCents: t.balanceCents };
    }).filter(r => r.balanceCents > 0);
    ok(res, out);
  }));

  app.get('/api/reports/kpis', requireAuth, requireRole('manager', 'admin', 'accountant'), wrap((req, res) => {
    const from = String(req.query.from ?? new Date().toISOString().slice(0, 10));
    const to = String(req.query.to ?? from);
    const daysInRange = nightsBetween(from, addDays(to, 1));
    const activeRooms = (db.prepare('SELECT COUNT(*) as c FROM rooms WHERE active = 1').get() as any).c as number;
    const oosRooms = (db.prepare(`SELECT COUNT(*) as c FROM rooms WHERE active = 1 AND status = 'out_of_service'`).get() as any).c as number;
    const availableNights = Math.max(0, (activeRooms - oosRooms)) * daysInRange;

    const reservations = db.prepare(`
      SELECT * FROM reservations
      WHERE status IN ('confirmed','in_progress','completed')
        AND check_in < ? AND check_out > ?`).all(addDays(to, 1), from) as any[];

    let occupiedNights = 0;
    let roomRevenueCents = 0;
    for (const r of reservations) {
      const totalNights = nightsBetween(r.check_in, r.check_out);
      const overlap = overlapNights(r.check_in, r.check_out, from, to);
      if (overlap <= 0 || totalNights <= 0) continue;
      occupiedNights += overlap;
      const proratedDiscount = Math.round(r.discount_cents * (overlap / totalNights));
      roomRevenueCents += overlap * r.nightly_rate_cents - proratedDiscount;
    }

    const occupancyRate = availableNights > 0 ? (occupiedNights / availableNights) * 100 : 0;
    const adrCents = occupiedNights > 0 ? Math.round(roomRevenueCents / occupiedNights) : 0;
    const revparCents = availableNights > 0 ? Math.round(roomRevenueCents / availableNights) : 0;

    ok(res, {
      from, to,
      daysInRange, activeRooms, oosRooms,
      availableNights, occupiedNights,
      roomRevenueCents,
      occupancyRate, adrCents, revparCents,
      definitions: {
        occupancyRate: 'Nuitées occupées / Nuitées disponibles × 100',
        adrCents: 'Recettes hébergement / Nuitées occupées',
        revparCents: 'Recettes hébergement / Nuitées disponibles',
        availableNightsDefinition: '(Chambres actives − Hors service) × Nuits de la période',
        notes: 'Les réservations annulées et no-show sont exclues. Les nuitées sont calculées sur l\'intersection entre le séjour et la période.'
      }
    });
  }));

  app.use((_req, res) => res.status(404).json({ error: 'Route introuvable' }));

  return app;
}