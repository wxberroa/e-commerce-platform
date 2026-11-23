import mongoose from 'mongoose';
import { config } from './config.js';
import { createApp } from './app.js';
import { Category } from './models/Category.js';
import { Product } from './models/Product.js';

async function main() {
  await mongoose.connect(config.mongoUri);
  await Promise.all([Category.syncIndexes(), Product.syncIndexes()]);

  const server = createApp().listen(config.port, () => {
    console.log(`product-catalog-service escuchando en el puerto ${config.port}`);
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
  console.error('No se pudo iniciar product-catalog-service', err);
  process.exit(1);
});
