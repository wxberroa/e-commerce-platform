import { Router } from 'express';
import { z } from 'zod';
import { Category } from '../models/Category.js';
import { requireAdmin } from '../middleware/auth.js';
import { HttpError, validate } from '../middleware/errors.js';

const createSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
});
const updateSchema = createSchema.partial().strict();

function findCategoryOr404(idOrSlug) {
  const category = Category.findByIdOrSlug(idOrSlug);
  if (!category) throw new HttpError(404, 'Categoría no encontrada');
  return category;
}

export const categoriesRouter = Router();

categoriesRouter.get('/', (_req, res) => {
  res.json(Category.list());
});

categoriesRouter.get('/:idOrSlug', (req, res) => {
  res.json(findCategoryOr404(req.params.idOrSlug));
});

categoriesRouter.post('/', requireAdmin, (req, res) => {
  const data = validate(createSchema, req.body);
  res.status(201).json(Category.create(data));
});

categoriesRouter.patch('/:idOrSlug', requireAdmin, (req, res) => {
  const data = validate(updateSchema, req.body);
  const category = findCategoryOr404(req.params.idOrSlug);
  res.json(Category.update(category.id, data));
});

categoriesRouter.delete('/:idOrSlug', requireAdmin, (req, res) => {
  const category = findCategoryOr404(req.params.idOrSlug);
  if (Category.hasProducts(category.id)) {
    throw new HttpError(409, 'La categoría tiene productos asociados');
  }
  Category.delete(category.id);
  res.status(204).end();
});
