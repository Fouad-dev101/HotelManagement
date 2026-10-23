import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });
export const DB_PATH = process.env.HOTELYX_DB_PATH ?? join(DATA_DIR, 'hotelyx.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','manager','reception','housekeeping','accountant','maintenance')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  hotel_name TEXT NOT NULL DEFAULT 'Hôtel YX',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'MAD',
  check_in_time TEXT NOT NULL DEFAULT '15:00',
  check_out_time TEXT NOT NULL DEFAULT '11:00',
  tax_rate_bp INTEGER NOT NULL DEFAULT 0,
  invoice_prefix TEXT NOT NULL DEFAULT 'FA',
  invoice_next_seq INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS room_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  capacity INTEGER NOT NULL DEFAULT 2,
  base_price_cents INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  floor INTEGER NOT NULL DEFAULT 0,
  room_type_id INTEGER REFERENCES room_types(id),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK(status IN ('available','occupied','dirty','cleaning','inspected','out_of_service')),
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS guests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE,
  guest_id INTEGER NOT NULL REFERENCES guests(id),
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  adults INTEGER NOT NULL DEFAULT 1,
  children INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','confirmed','in_progress','completed','cancelled','no_show')),
  nightly_rate_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(check_in < check_out)
);
CREATE INDEX IF NOT EXISTS idx_res_room_dates ON reservations(room_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_res_status ON reservations(status);
CREATE TABLE IF NOT EXISTS reservation_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES services(id),
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_id INTEGER NOT NULL REFERENCES reservations(id),
  amount_cents INTEGER NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('cash','card','transfer','other')),
  reference TEXT NOT NULL DEFAULT '',
  paid_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  reservation_id INTEGER NOT NULL REFERENCES reservations(id),
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  total_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL,
  paid_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued'
);
CREATE TABLE IF NOT EXISTS housekeeping_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  reservation_id INTEGER REFERENCES reservations(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','in_progress','done','inspected')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')),
  assigned_to INTEGER REFERENCES users(id),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS maintenance_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','in_progress','resolved','closed')),
  assigned_to INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

db.exec('INSERT OR IGNORE INTO settings (id) VALUES (1)');

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
}

export function audit(userId: number | null, action: string, entity: string, entityId: string | number | null, meta?: any) {
  db.prepare('INSERT INTO audit_log (user_id, action, entity, entity_id, meta) VALUES (?,?,?,?,?)')
    .run(userId, action, entity, entityId == null ? null : String(entityId), meta ? JSON.stringify(meta) : null);
}