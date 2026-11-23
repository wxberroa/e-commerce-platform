import { getDb } from '../db.js';

const now = () => new Date().toISOString();

const SELECT = `
  SELECT p.*, c.name AS category_name, c.slug AS category_slug
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
`;

const SORTS = {
  price: 'p.price ASC',
  '-price': 'p.price DESC',
  name: 'p.name ASC',
  '-name': 'p.name DESC',
  createdAt: 'p.created_at ASC, p.id ASC',
  '-createdAt': 'p.created_at DESC, p.id DESC',
};

function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    sku: row.sku,
    price: row.price,
    currency: row.currency,
    category: row.category_id ? { id: row.category_id, name: row.category_name, slug: row.category_slug } : null,
    images: JSON.parse(row.images),
    stock: row.stock,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function inventoryView(product) {
  return { productId: product.id, sku: product.sku, stock: product.stock, inStock: product.stock > 0 };
}

export const Product = {
  findById(id) {
    return toPublic(getDb().prepare(`${SELECT} WHERE p.id = ?`).get(id));
  },

  list({ q, categoryId, minPrice, maxPrice, inStock, sort, page, limit }) {
    const where = ['p.is_active = 1'];
    const params = [];
    if (q) {
      where.push('(p.name LIKE ? OR p.description LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (categoryId !== undefined) {
      where.push('p.category_id = ?');
      params.push(categoryId);
    }
    if (minPrice !== undefined) {
      where.push('p.price >= ?');
      params.push(minPrice);
    }
    if (maxPrice !== undefined) {
      where.push('p.price <= ?');
      params.push(maxPrice);
    }
    if (inStock === true) where.push('p.stock > 0');
    if (inStock === false) where.push('p.stock = 0');

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const db = getDb();
    const rows = db
      .prepare(`${SELECT} ${whereSql} ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`)
      .all(...params, limit, (page - 1) * limit);
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM products p ${whereSql}`).get(...params);
    return { items: rows.map(toPublic), total };
  },

  create(data) {
    const ts = now();
    const { lastInsertRowid } = getDb()
      .prepare(
        `INSERT INTO products
           (name, description, sku, price, currency, category_id, images, stock, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.name,
        data.description ?? null,
        data.sku.toUpperCase(),
        data.price,
        (data.currency ?? 'USD').toUpperCase(),
        data.category ?? null,
        JSON.stringify(data.images ?? []),
        data.stock ?? 0,
        data.isActive === false ? 0 : 1,
        ts,
        ts,
      );
    return Product.findById(Number(lastInsertRowid));
  },

  update(id, data) {
    const columns = {
      name: data.name,
      description: data.description,
      sku: data.sku?.toUpperCase(),
      price: data.price,
      currency: data.currency?.toUpperCase(),
      category_id: data.category,
      images: data.images && JSON.stringify(data.images),
      stock: data.stock,
      is_active: data.isActive === undefined ? undefined : Number(data.isActive),
    };
    const entries = Object.entries(columns).filter(([, v]) => v !== undefined);
    if (entries.length) {
      const set = entries.map(([k]) => `${k} = ?`).join(', ');
      getDb()
        .prepare(`UPDATE products SET ${set}, updated_at = ? WHERE id = ?`)
        .run(...entries.map(([, v]) => v), now(), id);
    }
    return Product.findById(id);
  },

  delete(id) {
    return getDb().prepare('DELETE FROM products WHERE id = ?').run(id).changes > 0;
  },

  setStock(id, stock) {
    getDb().prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?').run(stock, now(), id);
    return Product.findById(id);
  },

  // Ajuste atómico: una única sentencia UPDATE con condición, así dos peticiones
  // simultáneas nunca pueden dejar el stock en negativo.
  adjustStock(id, delta) {
    const { changes } = getDb()
      .prepare('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ? AND stock + ? >= 0')
      .run(delta, now(), id, delta);
    return changes > 0;
  },

  deleteAll() {
    getDb().exec('DELETE FROM products; DELETE FROM categories;');
  },
};
