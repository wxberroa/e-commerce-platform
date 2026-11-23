import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, parseId, validate } from '../middleware/errors.js';

const addressSchema = z.object({
  street: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  postalCode: z.string().trim().optional(),
  country: z.string().trim().optional(),
});

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().optional(),
    address: addressSchema.optional(),
  })
  .strict();

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

const updateRoleSchema = z.object({ role: z.enum(['customer', 'admin']) });

export const usersRouter = Router();
usersRouter.use(requireAuth);

function findUserOr404(id) {
  const user = User.findById(id);
  if (!user) throw new HttpError(404, 'Usuario no encontrado');
  return user;
}

// --- Perfil propio ---
usersRouter.get('/me', (req, res) => {
  res.json(findUserOr404(req.user.id));
});

usersRouter.patch('/me', (req, res) => {
  const data = validate(updateProfileSchema, req.body);
  findUserOr404(req.user.id);
  res.json(User.updateProfile(req.user.id, data));
});

usersRouter.put('/me/password', async (req, res) => {
  const { currentPassword, newPassword } = validate(changePasswordSchema, req.body);
  const row = User.findRowById(req.user.id);
  if (!row) throw new HttpError(404, 'Usuario no encontrado');
  if (!(await User.verifyPassword(row, currentPassword))) {
    throw new HttpError(401, 'La contraseña actual no es correcta');
  }
  await User.setPassword(req.user.id, newPassword);
  res.status(204).end();
});

usersRouter.delete('/me', (req, res) => {
  User.delete(req.user.id);
  res.status(204).end();
});

// --- Administración ---
usersRouter.get('/', requireRole('admin'), (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const { items, total } = User.list({ page, limit });
  res.json({ items, page, limit, total });
});

usersRouter.get('/:id', requireRole('admin'), (req, res) => {
  res.json(findUserOr404(parseId(req.params.id)));
});

usersRouter.patch('/:id/role', requireRole('admin'), (req, res) => {
  const { role } = validate(updateRoleSchema, req.body);
  const id = parseId(req.params.id);
  findUserOr404(id);
  res.json(User.setRole(id, role));
});
