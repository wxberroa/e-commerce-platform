import { config } from './config.js';
import { closeDb, openDb } from './db.js';
import { createApp } from './app.js';
import { User } from './models/User.js';

async function seedAdmin() {
  if (!config.adminEmail || !config.adminPassword) return;
  if (User.existsByEmail(config.adminEmail)) return;
  await User.create({
    email: config.adminEmail,
    password: config.adminPassword,
    name: 'Administrador',
    role: 'admin',
  });
  console.log(`Usuario administrador creado: ${config.adminEmail}`);
}

async function main() {
  openDb(config.dbPath);
  await seedAdmin();

  const server = createApp().listen(config.port, () => {
    console.log(`user-service escuchando en el puerto ${config.port} (SQLite: ${config.dbPath})`);
  });

  const shutdown = () => {
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('No se pudo iniciar user-service', err);
  process.exit(1);
});
