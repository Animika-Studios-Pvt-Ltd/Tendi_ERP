import { z } from 'zod';

const text = (max) => z.string().trim().max(max);

const numberingRule = z.object({
  prefix: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, 'Enter prefix')
    .max(15)
    .regex(/^[A-Z0-9-]+$/, 'Use letters, numbers or dashes'),
  nextNumber: z.coerce.number().int().min(1),
  padding: z.coerce.number().int().min(2).max(8),
});

export const updateSettingsSchema = z
  .object({
    companyProfile: z
      .object({
        name: z.string().trim().min(1, 'Enter company name').max(120).optional(),
        legalName: text(150).optional(),
        gstin: text(20).optional(),
        pan: text(15).optional(),
        email: z.union([z.email('Enter valid email').trim().toLowerCase(), z.literal('')]).optional(),
        phone: text(20).optional(),
        website: text(120).optional(),
        address: text(300).optional(),
        city: text(80).optional(),
        state: text(80).optional(),
        pincode: text(10).regex(/^\d*$/, 'Use digits only').optional(),
      })
      .optional(),
    preferences: z
      .object({
        currency: z.string().trim().toUpperCase().min(3).max(5).optional(),
        financialYearStartMonth: z.coerce.number().int().min(1).max(12).optional(),
        dateFormat: text(30).optional(),
      })
      .optional(),
    numberingSeries: z
      .object({
        project: numberingRule.optional(),
        site: numberingRule.optional(),
        dpr: numberingRule.optional(),
        materialRequest: numberingRule.optional(),
        purchaseOrder: numberingRule.optional(),
        goodsReceipt: numberingRule.optional(),
        expense: numberingRule.optional(),
        invoice: numberingRule.optional(),
      })
      .optional(),
    approvalLimits: z
      .array(
        z.object({
          module: z.string().trim().min(1),
          label: z.string().trim().min(1),
          pmLimit: z.coerce.number().min(0),
          requireAdminAboveLimit: z.boolean(),
        }),
      )
      .optional(),
    masterData: z
      .object({
        units: z.array(z.string().trim().min(1).max(40)).optional(),
        materialCategories: z.array(z.string().trim().min(1).max(80)).optional(),
        costHeads: z.array(z.string().trim().min(1).max(80)).optional(),
      })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Provide at least one setting section to update');

