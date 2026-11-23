import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from './errors.js';

export function signToken(user) {
  return jwt.sign({ role: user.role, email: user.email }, config.jwtSecret, {
    subject: user.id,
    expiresIn: config.jwtExpiresIn,
  });
}

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Token de autenticación requerido'));
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    return next();
  } catch {
    return next(new HttpError(401, 'Token inválido o expirado'));
  }
}

export function requireRole(role) {
  return (req, _res, next) => {
    if (req.user?.role !== role) return next(new HttpError(403, 'Permisos insuficientes'));
    return next();
  };
}
