import { Router } from 'express';
import { z } from 'zod';
import { Category } from '../models/Category.js';
import { Product, inventoryView } from '../models/Product.js';
import { requireAdmin } from '../middleware/auth.js';
import { HttpError, parseId, validate } from '../middleware/errors.js';

const createSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  sku: z.string().trim().min(1),
  price: z.number().nonnegative(),
  currency: z.string().length(3).optional(),
  category: z.number().int().positive().nullable().optional(),
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

function findProductOr404(rawId) {
  const product = Product.findById(parseId(rawId));
  if (!product) throw new HttpError(404, 'Producto no encontrado');
  return product;
}

function assertCategoryExists(categoryId) {
  if (categoryId && !Category.findById(categoryId)) {
    throw new HttpError(400, 'La categoría indicada no existe');
  }
}

export const productsRouter = Router();

// --- Catálogo (público) ---
productsRouter.get('/', (req, res) => {
  const query = validate(listQuerySchema, req.query);
  let categoryId;
  if (query.category) {
    const category = Category.findByIdOrSlug(query.category);
    if (!category) return res.json({ items: [], page: query.page, limit: query.limit, total: 0 });
    categoryId = category.id;
  }
  const { items, total } = Product.list({
    ...query,
    categoryId,
    inStock: query.inStock === undefined ? undefined : query.inStock === 'true',
  });
  return res.json({ items, page: query.page, limit: query.limit, total });
});

productsRouter.get('/:id', (req, res) => {
  res.json(findProductOr404(req.params.id));
});

// --- Administración de productos ---
productsRouter.post('/', requireAdmin, (req, res) => {
  const data = validate(createSchema, req.body);
  assertCategoryExists(data.category);
  res.status(201).json(Product.create(data));
});

productsRouter.patch('/:id', requireAdmin, (req, res) => {
  const data = validate(updateSchema, req.body);
  assertCategoryExists(data.category);
  const product = findProductOr404(req.params.id);
  res.json(Product.update(product.id, data));
});

productsRouter.delete('/:id', requireAdmin, (req, res) => {
  const product = findProductOr404(req.params.id);
  Product.delete(product.id);
  res.status(204).end();
});

// --- Inventario ---
productsRouter.get('/:id/inventory', (req, res) => {
  res.json(inventoryView(findProductOr404(req.params.id)));
});

productsRouter.put('/:id/inventory', requireAdmin, (req, res) => {
  const { stock } = validate(setStockSchema, req.body);
  const product = findProductOr404(req.params.id);
  res.json(inventoryView(Product.setStock(product.id, stock)));
});

// Ajuste atómico (+entrada / -salida). Pensado para que el futuro Order Service
// descuente stock sin condiciones de carrera.
productsRouter.post('/:id/inventory/adjust', requireAdmin, (req, res) => {
  const { delta } = validate(adjustStockSchema, req.body);
  const product = findProductOr404(req.params.id);
  if (!Product.adjustStock(product.id, delta)) throw new HttpError(409, 'Stock insuficiente');
  res.json(inventoryView(Product.findById(product.id)));
});
