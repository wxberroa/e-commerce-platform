import { ZodError } from 'zod';
import mongoose from 'mongoose';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function validate(schema, data) {
  return schema.parse(data);
}

export function notFound(_req, _res, next) {
  next(new HttpError(404, 'Ruta no encontrada'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Datos inválidos',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: `Identificador inválido: ${err.value}` });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'El recurso ya existe', details: err.keyValue });
  }
  if (err instanceof SyntaxError && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON mal formado' });
  }
  const status = err.status || 500;
  if (status >= 500) req.log?.error({ err }, 'Error no controlado');
  return res.status(status).json({
    error: status >= 500 ? 'Error interno del servidor' : err.message,
    ...(err.details && { details: err.details }),
  });
}
