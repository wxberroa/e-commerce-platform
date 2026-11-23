import { ZodError } from 'zod';

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

// Los ids son enteros positivos (INTEGER PRIMARY KEY de SQLite).
export function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1 || String(id) !== String(value)) {
    throw new HttpError(400, `Identificador inválido: ${value}`);
  }
  return id;
}

const SQLITE_CONSTRAINT_UNIQUE = 2067;
const SQLITE_CONSTRAINT_FOREIGNKEY = 787;

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
  if (err?.code === 'ERR_SQLITE_ERROR' && err.errcode === SQLITE_CONSTRAINT_UNIQUE) {
    return res.status(409).json({ error: 'El recurso ya existe', details: err.message });
  }
  if (err?.code === 'ERR_SQLITE_ERROR' && err.errcode === SQLITE_CONSTRAINT_FOREIGNKEY) {
    return res.status(409).json({ error: 'El recurso está referenciado por otros datos' });
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
