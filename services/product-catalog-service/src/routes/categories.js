import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { requireAdmin } from '../middleware/auth.js';
import { HttpError, validate } from '../middleware/errors.js';

const createSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
});
const updateSchema = createSchema.partial().strict();

// Permite buscar por id o por slug: /api/categories/electronica
export async function findCategory(idOrSlug) {
  const filter = mongoose.isValidObjectId(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
  return Category.findOne(filter);
}

async function findCategoryOr404(idOrSlug) {
  const category = await findCategory(idOrSlug);
  if (!category) throw new HttpError(404, 'Categoría no encontrada');
  return category;
}

export const categoriesRouter = Router();

categoriesRouter.get('/', async (_req, res) => {
  res.json(await Category.find().sort({ name: 1 }));
});

categoriesRouter.get('/:idOrSlug', async (req, res) => {
  res.json(await findCategoryOr404(req.params.idOrSlug));
});

categoriesRouter.post('/', requireAdmin, async (req, res) => {
  const data = validate(createSchema, req.body);
  res.status(201).json(await Category.create(data));
});

categoriesRouter.patch('/:idOrSlug', requireAdmin, async (req, res) => {
  const data = validate(updateSchema, req.body);
  const category = await findCategoryOr404(req.params.idOrSlug);
  category.set(data);
  await category.save();
  res.json(category);
});

categoriesRouter.delete('/:idOrSlug', requireAdmin, async (req, res) => {
  const category = await findCategoryOr404(req.params.idOrSlug);
  if (await Product.exists({ category: category._id })) {
    throw new HttpError(409, 'La categoría tiene productos asociados');
  }
  await category.deleteOne();
  res.status(204).end();
});
