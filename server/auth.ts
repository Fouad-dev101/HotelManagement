import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.js';

export const hashPassword = (p: string) => bcrypt.hashSync(p, 10);
export const verifyPassword = (p: string, h: string) => bcrypt.compareSync(p, h);

export function createSession(userId: number): string {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)').run(token, userId, expires);
  return token;
}

export type User = { id: number; email: string; full_name: string; role: string; active: number };

export function currentUser(req: Request): User | null {
  const token = (req as any).cookies?.hotelyx_session;
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.email, u.full_name, u.role, u.active
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as User | undefined;
  return row && row.active ? row : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Authentification requise' });
  (req as any).user = u;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const u = (req as any).user as User;
    if (!u) return res.status(401).json({ error: 'Authentification requise' });
    if (!roles.includes(u.role) && u.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    next();
  };
}