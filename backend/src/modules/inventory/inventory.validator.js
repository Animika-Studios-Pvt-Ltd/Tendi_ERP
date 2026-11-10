import mongoose from 'mongoose';
import { z } from 'zod';
import { TRANSACTION_TYPES } from '../../models/InventoryTransaction.js';

const text = (max) => z.string().trim().max(max);
const objectId = z.string().refine((value) => /^[a-f0-9]{24}$/i.test(value) && mongoose.isValidObjectId(value), 'Invalid id');

export const materialIdParams = z.object({ id: objectId });

export const listMaterialsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  q: text(120).optional(),
  category: text(80).optional(),
  isActive: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
});

export const createMaterialSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Material code must be 2-20 letters, numbers or dashes'),
  name: z.string().trim().min(1, 'Enter material name').max(150),
  category: z.string().trim().min(1, 'Select category').max(80),
  unit: z.string().trim().min(1, 'Select unit').max(30),
  hsnCode: text(20).optional().default(''),
  standardRate: z.coerce.number().min(0).optional().default(0),
  reorderLevel: z.coerce.number().min(0).optional().default(10),
  description: text(500).optional().default(''),
  isActive: z.boolean().optional().default(true),
});

export const updateMaterialSchema = createMaterialSchema.partial().omit({ code: true });

export const listStockQuery = z.object({
  project: objectId.optional(),
  category: text(80).optional(),
  lowStockOnly: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
  q: text(120).optional(),
});

export const listTransactionsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  project: objectId.optional(),
  site: objectId.optional(),
  material: objectId.optional(),
  type: z.enum(Object.values(TRANSACTION_TYPES)).optional(),
  q: text(120).optional(),
});

export const createTransactionSchema = z.object({
  project: objectId,
  site: z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null).optional(),
  material: objectId,
  type: z.enum(Object.values(TRANSACTION_TYPES)),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  direction: z.enum(['increase', 'decrease']).optional(),
  unitRate: z.coerce.number().min(0).optional(),
  transactionDate: z.string().optional(),
  issuedTo: text(120).optional().default(''),
  remarks: text(500).optional().default(''),
});

export const transferStockSchema = z.object({
  fromProject: objectId,
  fromSite: z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null).optional(),
  toProject: objectId,
  toSite: z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null).optional(),
  material: objectId,
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  remarks: text(500).optional().default(''),
});

