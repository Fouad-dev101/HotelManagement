import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DB_PATH, DATA_DIR } from './db.js';

const dir = join(DATA_DIR, 'backups');
mkdirSync(dir, { recursive: true });
const mode = process.argv[2];

if (mode === 'backup') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = join(dir, `hotelyx-${stamp}.db`);
  copyFileSync(DB_PATH, target);
  console.log('Sauvegarde créée :', target);
} else if (mode === 'restore') {
  const files = readdirSync(dir).filter(f => f.endsWith('.db')).sort();
  if (!files.length) { console.error('Aucune sauvegarde trouvée.'); process.exit(1); }
  const latest = join(dir, files[files.length - 1]);
  copyFileSync(latest, DB_PATH);
  console.log('Base restaurée depuis :', latest);
} else {
  console.log('Usage: tsx server/backup.ts [backup|restore]');
}