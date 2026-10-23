import { db } from './db.js';

const count = (db.prepare('SELECT COUNT(*) as c FROM rooms').get() as any).c as number;
if (count > 0) { console.log('Seed ignoré : données déjà présentes.'); process.exit(0); }

const rt = db.prepare('INSERT INTO room_types (name, description, capacity, base_price_cents) VALUES (?,?,?,?)')
  .run('Chambre Double', 'Chambre double avec lit queen', 2, 80000);
const rtId = Number(rt.lastInsertRowid);
db.prepare('INSERT INTO room_types (name, description, capacity, base_price_cents) VALUES (?,?,?,?)')
  .run('Suite', 'Suite avec salon séparé', 4, 180000);

['101','102','103','201','202','301'].forEach((n) => {
  db.prepare('INSERT INTO rooms (number, floor, room_type_id, status) VALUES (?,?,?,?)')
    .run(n, Number(n[0]), rtId, 'available');
});

db.prepare('INSERT INTO services (name, price_cents) VALUES (?,?)').run('Petit-déjeuner', 8000);
db.prepare('INSERT INTO services (name, price_cents) VALUES (?,?)').run('Blanchisserie', 4000);
db.prepare('INSERT INTO services (name, price_cents) VALUES (?,?)').run('Transfert aéroport', 25000);

console.log('Données de démonstration créées.');