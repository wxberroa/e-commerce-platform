import { config } from './config.js';
import { closeDb, openDb } from './db.js';
import { createApp } from './app.js';

function main() {
  openDb(config.dbPath);

  const server = createApp().listen(config.port, () => {
    console.log(`product-catalog-service escuchando en el puerto ${config.port} (SQLite: ${config.dbPath})`);
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

try {
  main();
} catch (err) {
  console.error('No se pudo iniciar product-catalog-service', err);
  process.exit(1);
}
