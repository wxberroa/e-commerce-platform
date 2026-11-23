const env = process.env;

export const config = {
  port: Number(env.PORT) || 3002,
  mongoUri: env.MONGO_URI || 'mongodb://localhost:27017/catalog',
  // Secreto compartido con user-service para verificar los JWT que este emite.
  jwtSecret: env.JWT_SECRET || 'dev-secret-change-me',
  logLevel: env.LOG_LEVEL || 'info',
};
