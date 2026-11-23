import bcrypt from 'bcryptjs';
import { getDb } from '../db.js';

const now = () => new Date().toISOString();

// Convierte una fila de la tabla en el objeto público (sin hash de contraseña).
export function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone ?? undefined,
    address: row.address ? JSON.parse(row.address) : undefined,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const User = {
  async create({ email, password, name, phone, role = 'customer' }) {
    const passwordHash = await bcrypt.hash(password, 10);
    const ts = now();
    const { lastInsertRowid } = getDb()
      .prepare(
        `INSERT INTO users (email, password_hash, name, phone, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(email.toLowerCase(), passwordHash, name, phone ?? null, role, ts, ts);
    return User.findById(Number(lastInsertRowid));
  },

  findById(id) {
    return toPublic(getDb().prepare('SELECT * FROM users WHERE id = ?').get(id));
  },

  // Devuelve la fila completa (con password_hash) para verificar credenciales.
  findRowByEmail(email) {
    return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  },

  findRowById(id) {
    return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
  },

  existsByEmail(email) {
    return Boolean(getDb().prepare('SELECT 1 FROM users WHERE email = ?').get(email.toLowerCase()));
  },

  verifyPassword(row, candidate) {
    return bcrypt.compare(candidate, row.password_hash);
  },

  updateProfile(id, { name, phone, address }) {
    const current = User.findRowById(id);
    if (!current) return null;
    getDb()
      .prepare('UPDATE users SET name = ?, phone = ?, address = ?, updated_at = ? WHERE id = ?')
      .run(
        name ?? current.name,
        phone !== undefined ? phone : current.phone,
        address !== undefined ? JSON.stringify(address) : current.address,
        now(),
        id,
      );
    return User.findById(id);
  },

  async setPassword(id, password) {
    const passwordHash = await bcrypt.hash(password, 10);
    getDb().prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, now(), id);
  },

  setRole(id, role) {
    getDb().prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, now(), id);
    return User.findById(id);
  },

  delete(id) {
    return getDb().prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
  },

  list({ page, limit }) {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM users ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?')
      .all(limit, (page - 1) * limit);
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM users').get();
    return { items: rows.map(toPublic), total };
  },

  deleteAll() {
    getDb().exec('DELETE FROM users');
  },
};
