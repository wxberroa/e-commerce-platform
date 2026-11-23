import { getDb } from '../db.js';

const now = () => new Date().toISOString();

export function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const Category = {
  list() {
    return getDb().prepare('SELECT * FROM categories ORDER BY name').all().map(toPublic);
  },

  findById(id) {
    return toPublic(getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id));
  },

  // Acepta un id numérico o un slug: /api/categories/7 o /api/categories/electronica
  findByIdOrSlug(idOrSlug) {
    const value = String(idOrSlug);
    const row = /^\d+$/.test(value)
      ? getDb().prepare('SELECT * FROM categories WHERE id = ?').get(Number(value))
      : getDb().prepare('SELECT * FROM categories WHERE slug = ?').get(value);
    return toPublic(row);
  },

  create({ name, description }) {
    const ts = now();
    const { lastInsertRowid } = getDb()
      .prepare('INSERT INTO categories (name, slug, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, slugify(name), description ?? null, ts, ts);
    return Category.findById(Number(lastInsertRowid));
  },

  update(id, { name, description }) {
    const current = Category.findById(id);
    getDb()
      .prepare('UPDATE categories SET name = ?, slug = ?, description = ?, updated_at = ? WHERE id = ?')
      .run(
        name ?? current.name,
        slugify(name ?? current.name),
        description !== undefined ? description : (current.description ?? null),
        now(),
        id,
      );
    return Category.findById(id);
  },

  hasProducts(id) {
    return Boolean(getDb().prepare('SELECT 1 FROM products WHERE category_id = ? LIMIT 1').get(id));
  },

  delete(id) {
    getDb().prepare('DELETE FROM categories WHERE id = ?').run(id);
  },
};
