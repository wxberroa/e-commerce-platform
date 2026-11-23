import { Router } from 'express';
import { z } from 'zod';
import { Product } from '../models/Product.js';
import { requireAdmin } from '../middleware/auth.js';
import { HttpError, validate } from '../middleware/errors.js';
import { findCategory } from './categories.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Identificador inválido');

const createSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  sku: z.string().trim().min(1),
  price: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
  category: objectId.optional(),
  images: z.array(z.url()).optional(),
  stock: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});
const updateSchema = createSchema.partial().strict();

const listQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  inStock: z.enum(['true', 'false']).optional(),
  sort: z.enum(['price', '-price', 'name', '-name', 'createdAt', '-createdAt']).default('-createdAt'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const setStockSchema = z.object({ stock: z.number().int().nonnegative() });
const adjustStockSchema = z.object({
  delta: z.number().int().refine((n) => n !== 0, 'delta no puede ser 0'),
});

async function findProductOr404(id) {
  const product = await Product.findById(id);
  if (!product) throw new HttpError(404, 'Producto no encontrado');
  return product;
}

async function assertCategoryExists(categoryId) {
  if (categoryId && !(await findCategory(categoryId))) {
    throw new HttpError(400, 'La categoría indicada no existe');
  }
}

function inventoryView(product) {
  return { productId: product.id, sku: product.sku, stock: product.stock, inStock: product.stock > 0 };
}

export const productsRouter = Router();

// --- Catálogo (público) ---
productsRouter.get('/', async (req, res) => {
  const query = validate(listQuerySchema, req.query);
  const filter = { isActive: true };

  if (query.q) filter.$text = { $search: query.q };
  if (query.category) {
    const category = await findCategory(query.category);
    if (!category) return res.json({ items: [], page: query.page, limit: query.limit, total: 0 });
    filter.category = category._id;
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.price = {};
    if (query.minPrice !== undefined) filter.price.$gte = query.minPrice;
    if (query.maxPrice !== undefined) filter.price.$lte = query.maxPrice;
  }
  if (query.inStock === 'true') filter.stock = { $gt: 0 };
  if (query.inStock === 'false') filter.stock = 0;

  const [items, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name slug')
      .sort(query.sort)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Product.countDocuments(filter),
  ]);
  return res.json({ items, page: query.page, limit: query.limit, total });
});

productsRouter.get('/:id', async (req, res) => {
  const product = await findProductOr404(req.params.id);
  await product.populate('category', 'name slug');
  res.json(product);
});

// --- Administración de productos ---
productsRouter.post('/', requireAdmin, async (req, res) => {
  const data = validate(createSchema, req.body);
  await assertCategoryExists(data.category);
  res.status(201).json(await Product.create(data));
});

productsRouter.patch('/:id', requireAdmin, async (req, res) => {
  const data = validate(updateSchema, req.body);
  await assertCategoryExists(data.category);
  const product = await findProductOr404(req.params.id);
  product.set(data);
  await product.save();
  res.json(product);
});

productsRouter.delete('/:id', requireAdmin, async (req, res) => {
  const product = await findProductOr404(req.params.id);
  await product.deleteOne();
  res.status(204).end();
});

// --- Inventario ---
productsRouter.get('/:id/inventory', async (req, res) => {
  res.json(inventoryView(await findProductOr404(req.params.id)));
});

productsRouter.put('/:id/inventory', requireAdmin, async (req, res) => {
  const { stock } = validate(setStockSchema, req.body);
  const product = await findProductOr404(req.params.id);
  product.stock = stock;
  await product.save();
  res.json(inventoryView(product));
});

// Ajuste atómico (+entrada / -salida). Pensado para que el futuro Order Service
// descuente stock sin condiciones de carrera.
productsRouter.post('/:id/inventory/adjust', requireAdmin, async (req, res) => {
  const { delta } = validate(adjustStockSchema, req.body);
  const filter = { _id: req.params.id };
  if (delta < 0) filter.stock = { $gte: -delta };

  const updated = await Product.findOneAndUpdate(filter, { $inc: { stock: delta } }, { returnDocument: 'after' });
  if (!updated) {
    await findProductOr404(req.params.id); // 404 si no existe
    throw new HttpError(409, 'Stock insuficiente');
  }
  res.json(inventoryView(updated));
});
