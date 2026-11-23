import mongoose from 'mongoose';
import { config } from './config.js';
import { createApp } from './app.js';
import { User } from './models/User.js';

async function seedAdmin() {
  if (!config.adminEmail || !config.adminPassword) return;
  const exists = await User.exists({ email: config.adminEmail.toLowerCase() });
  if (exists) return;
  await User.create({
    email: config.adminEmail,
    password: config.adminPassword,
    name: 'Administrador',
    role: 'admin',
  });
  console.log(`Usuario administrador creado: ${config.adminEmail}`);
}

async function main() {
  await mongoose.connect(config.mongoUri);
  await User.syncIndexes();
  await seedAdmin();

  const server = createApp().listen(config.port, () => {
    console.log(`user-service escuchando en el puerto ${config.port}`);
  });

  const shutdown = async () => {
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('No se pudo iniciar user-service', err);
  process.exit(1);
});
