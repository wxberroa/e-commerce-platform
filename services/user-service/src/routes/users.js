import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { HttpError, validate } from '../middleware/errors.js';

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

async function findUserOr404(id, withPassword = false) {
  const query = User.findById(id);
  if (withPassword) query.select('+password');
  const user = await query;
  if (!user) throw new HttpError(404, 'Usuario no encontrado');
  return user;
}

// --- Perfil propio ---
usersRouter.get('/me', async (req, res) => {
  res.json(await findUserOr404(req.user.id));
});

usersRouter.patch('/me', async (req, res) => {
  const data = validate(updateProfileSchema, req.body);
  const user = await findUserOr404(req.user.id);
  user.set(data);
  await user.save();
  res.json(user);
});

usersRouter.put('/me/password', async (req, res) => {
  const { currentPassword, newPassword } = validate(changePasswordSchema, req.body);
  const user = await findUserOr404(req.user.id, true);
  if (!(await user.comparePassword(currentPassword))) {
    throw new HttpError(401, 'La contraseña actual no es correcta');
  }
  user.password = newPassword;
  await user.save();
  res.status(204).end();
});

usersRouter.delete('/me', async (req, res) => {
  await User.deleteOne({ _id: req.user.id });
  res.status(204).end();
});

// --- Administración ---
usersRouter.get('/', requireRole('admin'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const [items, total] = await Promise.all([
    User.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(),
  ]);
  res.json({ items, page, limit, total });
});

usersRouter.get('/:id', requireRole('admin'), async (req, res) => {
  res.json(await findUserOr404(req.params.id));
});

usersRouter.patch('/:id/role', requireRole('admin'), async (req, res) => {
  const { role } = validate(updateRoleSchema, req.body);
  const user = await findUserOr404(req.params.id);
  user.role = role;
  await user.save();
  res.json(user);
});
