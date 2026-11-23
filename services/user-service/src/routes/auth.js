import { Router } from 'express';
import { z } from 'zod';
import { User, toPublic } from '../models/User.js';
import { signToken } from '../middleware/auth.js';
import { HttpError, validate } from '../middleware/errors.js';

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  name: z.string().trim().min(1),
  phone: z.string().trim().optional(),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const data = validate(registerSchema, req.body);
  if (User.existsByEmail(data.email)) throw new HttpError(409, 'El email ya está registrado');

  const user = await User.create(data); // el rol siempre es "customer" al registrarse
  res.status(201).json({ user, token: signToken(user) });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = validate(loginSchema, req.body);
  const row = User.findRowByEmail(email);
  if (!row || !(await User.verifyPassword(row, password))) {
    throw new HttpError(401, 'Credenciales inválidas');
  }
  const user = toPublic(row);
  res.json({ user, token: signToken(user) });
});
