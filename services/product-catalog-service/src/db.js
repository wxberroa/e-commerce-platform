import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  sku         TEXT NOT NULL UNIQUE,
  price       REAL NOT NULL CHECK (price >= 0),
  currency    TEXT NOT NULL DEFAULT 'USD',
  category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  images      TEXT NOT NULL DEFAULT '[]',          -- JSON
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
`;

let db;

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

export function getDb() {
  if (!db) throw new Error('La base de datos no está inicializada');
  return db;
}

export function isDbUp() {
  try {
    return getDb().prepare('SELECT 1 AS ok').get().ok === 1;
  } catch {
    return false;
  }
}

export function closeDb() {
  db?.close();
  db = undefined;
}
