import mongoose from 'mongoose';
import { z } from 'zod';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';

const text = (max) => z.string().trim().max(max);
const objectId = z.string().refine((value) => /^[a-f0-9]{24}$/i.test(value) && mongoose.isValidObjectId(value), 'Invalid id');

export const idParams = z.object({ id: objectId });

/* Vendors */
export const listVendorsQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  q: text(120).optional(),
  category: text(80).optional(),
  isActive: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
});

export const createVendorSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Vendor code must be 2-20 letters, numbers or dashes'),
  name: z.string().trim().min(1, 'Enter vendor name').max(150),
  contactPerson: text(120).optional().default(''),
  email: z.union([z.email('Enter valid email').trim().toLowerCase(), z.literal('')]).optional().default(''),
  phone: text(20).optional().default(''),
  gstin: text(20).optional().default(''),
  pan: text(15).optional().default(''),
  categories: z.array(z.string().trim().max(80)).optional().default([]),
  address: z
    .object({
      street: text(300).optional().default(''),
      city: text(80).optional().default(''),
      state: text(80).optional().default(''),
      pincode: text(10).optional().default(''),
    })
    .optional()
    .default({}),
  paymentTermsDays: z.coerce.number().int().min(0).optional().default(30),
  rating: z.coerce.number().min(1).max(5).optional().default(4),
  isActive: z.boolean().optional().default(true),
});

export const updateVendorSchema = createVendorSchema.partial().omit({ code: true });

/* Material Requests */
export const listMrQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  q: text(120).optional(),
  project: objectId.optional(),
  status: z.enum(Object.values(APPROVAL_STATUS)).optional(),
  priority: z.enum(['normal', 'urgent', 'critical']).optional(),
});

export const createMrSchema = z.object({
  project: objectId,
  site: z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null).optional(),
  requiredByDate: z.string().min(1, 'Enter required-by date'),
  priority: z.enum(['normal', 'urgent', 'critical']).optional().default('normal'),
  items: z
    .array(
      z.object({
        material: objectId,
        quantity: z.coerce.number().positive('Quantity must be greater than 0'),
        unit: z.string().trim().min(1).max(30),
        notes: text(300).optional().default(''),
      }),
    )
    .min(1, 'Add at least one material item'),
  remarks: text(1000).optional().default(''),
});

export const updateMrSchema = createMrSchema.partial().omit({ project: true });

export const transitionSchema = z.object({
  status: z.enum(Object.values(APPROVAL_STATUS)),
  comment: text(1000).optional(),
});

/* Purchase Orders */
export const listPoQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  q: text(120).optional(),
  project: objectId.optional(),
  vendor: objectId.optional(),
  status: z.enum(Object.values(APPROVAL_STATUS)).optional(),
  deliveryStatus: z.enum(['pending', 'partially_received', 'fully_received']).optional(),
});

export const createPoSchema = z.object({
  project: objectId,
  vendor: objectId,
  materialRequest: z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null).optional(),
  poDate: z.string().optional(),
  expectedDeliveryDate: z.string().optional(),
  items: z
    .array(
      z.object({
        material: objectId,
        quantity: z.coerce.number().positive('Quantity must be positive'),
        unit: z.string().trim().min(1).max(30),
        unitRate: z.coerce.number().min(0),
        taxPercent: z.coerce.number().min(0).max(100).optional().default(18),
      }),
    )
    .min(1, 'Add at least one item to PO'),
  termsAndConditions: text(2000).optional().default(''),
});

export const updatePoSchema = createPoSchema.partial().omit({ project: true });

/* Goods Receipts (GRN) */
export const listGrnQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  q: text(120).optional(),
  project: objectId.optional(),
  purchaseOrder: objectId.optional(),
});

export const createGrnSchema = z.object({
  purchaseOrder: objectId,
  site: z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null).optional(),
  receivedDate: z.string().optional(),
  challanNumber: text(80).optional().default(''),
  items: z
    .array(
      z.object({
        material: objectId,
        receivedQuantity: z.coerce.number().positive('Received quantity must be > 0'),
        remarks: text(300).optional().default(''),
      }),
    )
    .min(1, 'Receive at least one item'),
  remarks: text(1000).optional().default(''),
});

