const env = process.env;

export const config = {
  port: Number(env.PORT) || 3001,
  // Ruta del archivo SQLite (":memory:" para una base en memoria).
  dbPath: env.DB_PATH || './data/users.db',
  jwtSecret: env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: env.JWT_EXPIRES_IN || '1h',
  // Usuario administrador inicial (opcional). Se crea al arrancar si no existe.
  adminEmail: env.ADMIN_EMAIL,
  adminPassword: env.ADMIN_PASSWORD,
  logLevel: env.LOG_LEVEL || 'info',
};
