const env = process.env;

export const config = {
  port: Number(env.PORT) || 3001,
  mongoUri: env.MONGO_URI || 'mongodb://localhost:27017/users',
  jwtSecret: env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: env.JWT_EXPIRES_IN || '1h',
  // Usuario administrador inicial (opcional). Se crea al arrancar si no existe.
  adminEmail: env.ADMIN_EMAIL,
  adminPassword: env.ADMIN_PASSWORD,
  logLevel: env.LOG_LEVEL || 'info',
};
