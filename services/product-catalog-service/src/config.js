const env = process.env;

export const config = {
  port: Number(env.PORT) || 3002,
  // Ruta del archivo SQLite (":memory:" para una base en memoria).
  dbPath: env.DB_PATH || './data/catalog.db',
  // Secreto compartido con user-service para verificar los JWT que este emite.
  jwtSecret: env.JWT_SECRET || 'dev-secret-change-me',
  logLevel: env.LOG_LEVEL || 'info',
};
