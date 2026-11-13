import mongoose from 'mongoose';
import { z } from 'zod';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';
import { SITE_STATUS } from '../../models/Site.js';
import { WEATHER_CONDITIONS, WEATHER_IMPACTS } from '../../models/DailyProgressReport.js';

const text = (max) => z.string().trim().max(max);
const objectId = z.string().refine((value) => /^[a-f0-9]{24}$/i.test(value) && mongoose.isValidObjectId(value), 'Invalid id');

const dateField = z
  .union([z.iso.date(), z.literal(''), z.null()])
  .transform((value) => (value ? new Date(`${value}T00:00:00.000Z`) : null));

export const siteIdParams = z.object({
  id: objectId,
});

export const dprIdParams = z.object({
  id: objectId,
});

export const listSitesQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  q: text(120).optional(),
  project: objectId.optional(),
  status: z.enum(Object.values(SITE_STATUS)).optional(),
});

export const createSiteSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Site code must be 2-20 letters, numbers or dashes'),
  name: z.string().trim().min(1, 'Enter the site name').max(120),
  project: objectId,
  description: text(1000).optional().default(''),
  status: z.enum(Object.values(SITE_STATUS)).optional().default(SITE_STATUS.ACTIVE),
  location: z
    .object({
      address: text(300).optional().default(''),
      city: text(80).optional().default(''),
      state: text(80).optional().default(''),
      pincode: text(10)
        .regex(/^\d*$/, 'Use digits only')
        .optional()
        .default(''),
    })
    .optional()
    .default({}),
  siteEngineer: z.union([objectId, z.literal(''), z.null()]).transform((value) => value || null).optional(),
  startDate: dateField.optional(),
  targetCompletionDate: dateField.optional(),
});

export const updateSiteSchema = z.object({
  name: z.string().trim().min(1, 'Enter the site name').max(120).optional(),
  description: text(1000).optional(),
  status: z.enum(Object.values(SITE_STATUS)).optional(),
  location: z
    .object({
      address: text(300).optional(),
      city: text(80).optional(),
      state: text(80).optional(),
      pincode: text(10).regex(/^\d*$/, 'Use digits only').optional(),
    })
    .optional(),
  siteEngineer: z.union([objectId, z.literal(''), z.null()]).transform((value) => value || null).optional(),
  startDate: dateField.optional(),
  targetCompletionDate: dateField.optional(),
  actualCompletionDate: dateField.optional(),
});

export const listDprQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
  q: text(120).optional(),
  project: objectId.optional(),
  site: objectId.optional(),
  status: z.enum(Object.values(APPROVAL_STATUS)).optional(),
  startDate: dateField.optional(),
  endDate: dateField.optional(),
});

export const createDprSchema = z.object({
  project: objectId,
  site: objectId,
  reportDate: z.string().min(1, 'Select report date'),
  weather: z
    .object({
      condition: z.enum(Object.values(WEATHER_CONDITIONS)).optional().default(WEATHER_CONDITIONS.SUNNY),
      temperature: z.coerce.number().optional().default(28),
      weatherImpact: z.enum(Object.values(WEATHER_IMPACTS)).optional().default(WEATHER_IMPACTS.NONE),
    })
    .optional()
    .default({}),
  workDone: z
    .array(
      z.object({
        description: z.string().trim().min(1, 'Enter work description').max(500),
        locationOrGrid: text(100).optional().default(''),
        quantity: z.coerce.number().min(0).optional().default(0),
        unit: text(30).optional().default(''),
        status: z.enum(['in_progress', 'completed', 'blocked']).optional().default('in_progress'),
      }),
    )
    .optional()
    .default([]),
  labourAttendance: z
    .array(
      z.object({
        trade: z.string().trim().min(1, 'Enter trade / skill').max(60),
        headcount: z.coerce.number().int().min(0, 'Headcount cannot be negative'),
        hoursWorked: z.coerce.number().min(0).max(24).optional().default(8),
        contractorName: text(120).optional().default(''),
      }),
    )
    .optional()
    .default([]),
  materialUsage: z
    .array(
      z.object({
        material: z.union([objectId, z.literal(''), z.null()]).transform((value) => value || null).optional(),
        materialName: z.string().trim().min(1, 'Enter material name').max(120),
        quantity: z.coerce.number().min(0, 'Quantity cannot be negative'),
        unit: z.string().trim().min(1, 'Enter unit').max(30),
        notes: text(200).optional().default(''),
      }),
    )
    .optional()
    .default([]),
  equipmentUsage: z
    .array(
      z.object({
        equipment: z.union([objectId, z.literal(''), z.null()]).transform((value) => value || null).optional(),
        equipmentName: z.string().trim().min(1, 'Enter equipment name').max(120),
        hoursOperated: z.coerce.number().min(0).max(24),
        status: z.enum(['operational', 'breakdown', 'idle']).optional().default('operational'),
      }),
    )
    .optional()
    .default([]),
  siteIssues: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'Enter issue title').max(150),
        severity: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
        status: z.enum(['open', 'in_progress', 'resolved']).optional().default('open'),
        assignedTo: z.union([objectId, z.literal(''), z.null()]).transform((value) => value || null).optional(),
        actionPlan: text(500).optional().default(''),
      }),
    )
    .optional()
    .default([]),
  photos: z
    .array(
      z.object({
        url: z.string().url('Enter a valid image URL'),
        caption: text(200).optional().default(''),
        key: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
  remarks: text(1000).optional().default(''),
});

export const updateDprSchema = createDprSchema.partial().omit({ project: true, site: true });

export const transitionDprSchema = z.object({
  status: z.enum(Object.values(APPROVAL_STATUS)),
  comment: text(1000).optional(),
});

export const listInstructionsQuery = z.object({
  project: objectId.optional(),
  site: objectId.optional(),
  status: z.enum(['open', 'acknowledged', 'complied', 'closed']).optional(),
});

export const createInstructionSchema = z.object({
  project: objectId,
  site: objectId,
  subject: z.string().trim().min(2).max(180),
  instruction: z.string().trim().min(2).max(2000),
  category: z.enum(['quality', 'safety', 'progress', 'rework', 'general']).optional().default('general'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
  issuedToName: text(120).optional().default(''),
  issuedToUser: z.union([objectId, z.literal(''), z.null()]).transform((value) => value || null).optional(),
  dueDate: dateField.optional(),
});

export const updateInstructionSchema = z.object({
  status: z.enum(['open', 'acknowledged', 'complied', 'closed']).optional(),
  responseNotes: text(1000).optional(),
});

