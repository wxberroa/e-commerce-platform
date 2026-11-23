import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';

let mongod;
const app = createApp({ logging: false });

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.syncIndexes();
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
});

const alice = { email: 'alice@example.com', password: 'supersecret', name: 'Alice' };

async function register(user = alice) {
  return request(app).post('/api/auth/register').send(user);
}

test('GET /health responde ok', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('registro crea usuario customer y devuelve token sin la contraseña', async () => {
  const res = await register();
  assert.equal(res.status, 201);
  assert.ok(res.body.token);
  assert.equal(res.body.user.email, alice.email);
  assert.equal(res.body.user.role, 'customer');
  assert.equal(res.body.user.password, undefined);
});

test('registro ignora un rol enviado por el cliente', async () => {
  const res = await register({ ...alice, role: 'admin' });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, 'customer');
});

test('registro rechaza email duplicado y datos inválidos', async () => {
  await register();
  assert.equal((await register()).status, 409);
  const bad = await register({ email: 'no-es-email', password: '123', name: '' });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.details.length >= 2);
});

test('login con credenciales correctas e incorrectas', async () => {
  await register();
  const ok = await request(app).post('/api/auth/login').send({ email: alice.email, password: alice.password });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  const bad = await request(app).post('/api/auth/login').send({ email: alice.email, password: 'wrongpass' });
  assert.equal(bad.status, 401);
});

test('perfil: requiere token, se lee y se actualiza', async () => {
  const { body } = await register();
  const auth = { Authorization: `Bearer ${body.token}` };

  assert.equal((await request(app).get('/api/users/me')).status, 401);
  assert.equal((await request(app).get('/api/users/me').set('Authorization', 'Bearer basura')).status, 401);

  const me = await request(app).get('/api/users/me').set(auth);
  assert.equal(me.status, 200);
  assert.equal(me.body.name, 'Alice');

  const upd = await request(app)
    .patch('/api/users/me')
    .set(auth)
    .send({ name: 'Alice Doe', address: { city: 'Madrid', country: 'ES' } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.name, 'Alice Doe');
  assert.equal(upd.body.address.city, 'Madrid');

  // No se permite cambiar el rol ni el email por esta vía
  assert.equal((await request(app).patch('/api/users/me').set(auth).send({ role: 'admin' })).status, 400);
});

test('cambio de contraseña', async () => {
  const { body } = await register();
  const auth = { Authorization: `Bearer ${body.token}` };
  const wrong = await request(app)
    .put('/api/users/me/password')
    .set(auth)
    .send({ currentPassword: 'nope', newPassword: 'newsecret1' });
  assert.equal(wrong.status, 401);
  const ok = await request(app)
    .put('/api/users/me/password')
    .set(auth)
    .send({ currentPassword: alice.password, newPassword: 'newsecret1' });
  assert.equal(ok.status, 204);
  const login = await request(app).post('/api/auth/login').send({ email: alice.email, password: 'newsecret1' });
  assert.equal(login.status, 200);
});

test('endpoints de administración solo para admin', async () => {
  const { body: customer } = await register();
  await User.create({ email: 'admin@example.com', password: 'adminpass', name: 'Admin', role: 'admin' });
  const { body: admin } = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@example.com', password: 'adminpass' });

  const forbidden = await request(app).get('/api/users').set('Authorization', `Bearer ${customer.token}`);
  assert.equal(forbidden.status, 403);

  const list = await request(app).get('/api/users').set('Authorization', `Bearer ${admin.token}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 2);

  const promote = await request(app)
    .patch(`/api/users/${customer.user.id}/role`)
    .set('Authorization', `Bearer ${admin.token}`)
    .send({ role: 'admin' });
  assert.equal(promote.status, 200);
  assert.equal(promote.body.role, 'admin');

  const badId = await request(app).get('/api/users/123').set('Authorization', `Bearer ${admin.token}`);
  assert.equal(badId.status, 400);
});
