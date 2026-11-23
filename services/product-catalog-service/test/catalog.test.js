import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { closeDb, openDb } from '../src/db.js';
import { Product } from '../src/models/Product.js';

const app = createApp({ logging: false });

// Tokens con el mismo formato que emite user-service
const token = (role) => jwt.sign({ role }, config.jwtSecret, { subject: '1' });
const admin = { Authorization: `Bearer ${token('admin')}` };
const customer = { Authorization: `Bearer ${token('customer')}` };

before(() => openDb(':memory:'));
after(() => closeDb());
beforeEach(() => Product.deleteAll());

async function createCategory(name = 'Electrónica') {
  const res = await request(app).post('/api/categories').set(admin).send({ name });
  assert.equal(res.status, 201);
  return res.body;
}

async function createProduct(data) {
  const res = await request(app)
    .post('/api/products')
    .set(admin)
    .send({ name: 'Teclado', sku: 'kb-001', price: 50, stock: 10, ...data });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

test('GET /health responde ok', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
});

test('categorías: CRUD con slug y permisos de admin', async () => {
  assert.equal((await request(app).post('/api/categories').send({ name: 'X' })).status, 401);
  assert.equal((await request(app).post('/api/categories').set(customer).send({ name: 'X' })).status, 403);

  const cat = await createCategory('Electrónica y Hogar');
  assert.equal(cat.slug, 'electronica-y-hogar');

  const bySlug = await request(app).get('/api/categories/electronica-y-hogar');
  assert.equal(bySlug.status, 200);
  assert.equal(bySlug.body.id, cat.id);

  assert.equal((await request(app).post('/api/categories').set(admin).send({ name: 'Electrónica y Hogar' })).status, 409);

  const upd = await request(app).patch(`/api/categories/${cat.id}`).set(admin).send({ name: 'Hogar' });
  assert.equal(upd.body.slug, 'hogar');

  assert.equal((await request(app).delete(`/api/categories/${cat.id}`).set(admin)).status, 204);
  assert.equal((await request(app).get(`/api/categories/${cat.id}`)).status, 404);
});

test('no se puede borrar una categoría con productos', async () => {
  const cat = await createCategory();
  await createProduct({ category: cat.id });
  assert.equal((await request(app).delete(`/api/categories/${cat.id}`).set(admin)).status, 409);
});

test('productos: creación, validación, SKU único y categoría existente', async () => {
  const p = await createProduct();
  assert.equal(p.sku, 'KB-001');

  assert.equal((await request(app).post('/api/products').set(customer).send({})).status, 403);
  assert.equal((await request(app).post('/api/products').set(admin).send({ name: 'x', sku: 'y', price: -1 })).status, 400);
  assert.equal(
    (await request(app).post('/api/products').set(admin).send({ name: 'Otro', sku: 'KB-001', price: 1 })).status,
    409,
  );
  const fakeCat = 9999;
  assert.equal(
    (await request(app).post('/api/products').set(admin).send({ name: 'Otro', sku: 'Z', price: 1, category: fakeCat }))
      .status,
    400,
  );

  const upd = await request(app).patch(`/api/products/${p.id}`).set(admin).send({ price: 45 });
  assert.equal(upd.body.price, 45);

  const sinCat = await request(app).patch(`/api/products/${p.id}`).set(admin).send({ category: null });
  assert.equal(sinCat.body.category, null);
  assert.equal((await request(app).get('/api/products/abc')).status, 400);

  assert.equal((await request(app).delete(`/api/products/${p.id}`).set(admin)).status, 204);
  assert.equal((await request(app).get(`/api/products/${p.id}`)).status, 404);
});

test('listado público con filtros, búsqueda, orden y paginación', async () => {
  const cat = await createCategory('Periféricos');
  await createProduct({ name: 'Teclado mecánico', sku: 'A1', price: 80, stock: 5, category: cat.id });
  await createProduct({ name: 'Ratón inalámbrico', sku: 'A2', price: 25, stock: 0, category: cat.id });
  await createProduct({ name: 'Monitor 27', sku: 'A3', price: 300, stock: 2 });
  await createProduct({ name: 'Producto oculto', sku: 'A4', price: 10, isActive: false });

  const all = await request(app).get('/api/products');
  assert.equal(all.body.total, 3); // los inactivos no aparecen

  const byCat = await request(app).get('/api/products?category=perifericos');
  assert.equal(byCat.body.total, 2);
  assert.equal(byCat.body.items[0].category.slug, 'perifericos');

  const price = await request(app).get('/api/products?minPrice=20&maxPrice=100&sort=price');
  assert.deepEqual(price.body.items.map((p) => p.sku), ['A2', 'A1']);

  const stock = await request(app).get('/api/products?inStock=true');
  assert.equal(stock.body.total, 2);

  const search = await request(app).get('/api/products?q=teclado');
  assert.deepEqual(search.body.items.map((p) => p.sku), ['A1']);

  const paged = await request(app).get('/api/products?limit=2&page=2&sort=name');
  assert.equal(paged.body.items.length, 1);

  assert.equal((await request(app).get('/api/products?sort=bogus')).status, 400);
  assert.equal((await request(app).get('/api/products?category=no-existe')).body.total, 0);
});

test('inventario: consulta, fijar stock y ajustes atómicos', async () => {
  const p = await createProduct({ stock: 3 });

  const inv = await request(app).get(`/api/products/${p.id}/inventory`);
  assert.deepEqual(inv.body, { productId: p.id, sku: 'KB-001', stock: 3, inStock: true });

  assert.equal((await request(app).put(`/api/products/${p.id}/inventory`).set(customer).send({ stock: 1 })).status, 403);
  const set = await request(app).put(`/api/products/${p.id}/inventory`).set(admin).send({ stock: 5 });
  assert.equal(set.body.stock, 5);

  const down = await request(app).post(`/api/products/${p.id}/inventory/adjust`).set(admin).send({ delta: -5 });
  assert.equal(down.status, 200);
  assert.equal(down.body.stock, 0);
  assert.equal(down.body.inStock, false);

  const tooMuch = await request(app).post(`/api/products/${p.id}/inventory/adjust`).set(admin).send({ delta: -1 });
  assert.equal(tooMuch.status, 409);

  const up = await request(app).post(`/api/products/${p.id}/inventory/adjust`).set(admin).send({ delta: 7 });
  assert.equal(up.body.stock, 7);

  const missing = 9999;
  assert.equal(
    (await request(app).post(`/api/products/${missing}/inventory/adjust`).set(admin).send({ delta: -1 })).status,
    404,
  );
});

test('ajustes concurrentes no dejan stock negativo', async () => {
  const p = await createProduct({ stock: 5 });
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      request(app).post(`/api/products/${p.id}/inventory/adjust`).set(admin).send({ delta: -1 }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 200).length, 5);
  assert.equal(results.filter((r) => r.status === 409).length, 5);
  const inv = await request(app).get(`/api/products/${p.id}/inventory`);
  assert.equal(inv.body.stock, 0);
});
