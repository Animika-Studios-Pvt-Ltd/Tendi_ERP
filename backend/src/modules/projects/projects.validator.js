import mongoose from 'mongoose';
import { z } from 'zod';
import { CHANGE_ORDER_TYPE } from '../../models/ChangeOrder.js';
import { MILESTONE_STATUS } from '../../models/Milestone.js';
import { APPROVAL_STATUS } from '../../models/plugins/approvalWorkflow.js';
import { PROJECT_STATUS } from '../../models/Project.js';
import { RISK_CATEGORY, RISK_LEVEL, RISK_STATUS } from '../../models/ProjectRisk.js';
import { TASK_PRIORITY, TASK_STATUS } from '../../models/Task.js';

const text = (max) => z.string().trim().max(max);
const objectId = z.string().refine((value) => /^[a-f0-9]{24}$/i.test(value) && mongoose.isValidObjectId(value), 'Invalid id');

// Dates arrive as "YYYY-MM-DD" from date inputs; empty string or null clears the field.
const dateField = z
  .union([z.iso.date(), z.literal(''), z.null()])
  .transform((value) => (value ? new Date(`${value}T00:00:00.000Z`) : null));

const projectFields = {
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Use 2-20 letters, numbers or dashes'),
  name: z.string().trim().min(1, 'Enter the project name').max(120),
  description: text(2000),
  status: z.enum(Object.values(PROJECT_STATUS)),
  client: z.object({
    name: text(120).optional(),
    contactPerson: text(120).optional(),
    phone: text(20)
      .regex(/^[+\d\s()-]*$/, 'Enter a valid phone number')
      .optional(),
  }),
  location: z.object({
    address: text(300).optional(),
    city: text(80).optional(),
    state: text(80).optional(),
    pincode: text(10)
      .regex(/^\d*$/, 'Use digits only')
      .optional(),
  }),
  contractValue: z.coerce.number().min(0, 'Cannot be negative').max(1e13, 'Value is too large'),
  startDate: dateField,
  plannedEndDate: dateField,
  actualEndDate: dateField,
  progressPercent: z.coerce.number().int().min(0).max(100),
  projectManager: z.union([objectId, z.literal(''), z.null()]).transform((value) => value || null),
};

function datesInOrder(value, ctx) {
  const { startDate, plannedEndDate, actualEndDate } = value;
  if (startDate && plannedEndDate && plannedEndDate < startDate) {
    ctx.addIssue({ code: 'custom', path: ['plannedEndDate'], message: 'Planned end must be on or after the start date' });
  }
  if (startDate && actualEndDate && actualEndDate < startDate) {
    ctx.addIssue({ code: 'custom', path: ['actualEndDate'], message: 'Actual end must be on or after the start date' });
  }
}

export const createProjectSchema = z
  .object({
    ...projectFields,
    description: projectFields.description.optional().default(''),
    status: projectFields.status.optional().default(PROJECT_STATUS.PLANNING),
    client: projectFields.client.optional().default({}),
    location: projectFields.location.optional().default({}),
    contractValue: projectFields.contractValue.optional().default(0),
    startDate: projectFields.startDate.optional(),
    plannedEndDate: projectFields.plannedEndDate.optional(),
    actualEndDate: projectFields.actualEndDate.optional(),
    progressPercent: projectFields.progressPercent.optional().default(0),
    projectManager: projectFields.projectManager.optional(),
  })
  .superRefine(datesInOrder);

export const updateProjectSchema = z
  .object(Object.fromEntries(Object.entries(projectFields).map(([key, schema]) => [key, schema.optional()])))
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update')
  .superRefine(datesInOrder);

export const listProjectsQuery = z.object({
  q: text(100).optional(),
  status: z.enum(Object.values(PROJECT_STATUS)).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().max(60).optional(),
});

export const projectIdParams = z.object({ id: objectId });
export const teamMemberParams = z.object({ id: objectId, userId: objectId });
export const addTeamMemberSchema = z
  .object({
    userId: objectId.optional(),
    userIds: z.array(objectId).min(1).optional(),
  })
  .refine((data) => Boolean(data.userId || (data.userIds && data.userIds.length > 0)), {
    message: 'Provide userId or userIds',
  });
export const userLookupQuery = z.object({
  q: text(100).optional(),
  forProjectManager: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
});

/* Tasks */
export const taskIdParams = z.object({ id: objectId });

export const listTasksQuery = z.object({
  q: text(100).optional(),
  project: objectId.optional(),
  milestone: objectId.optional(),
  assignedTo: objectId.optional(),
  status: z.enum(Object.values(TASK_STATUS)).optional(),
  priority: z.enum(Object.values(TASK_PRIORITY)).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().max(60).optional(),
});

const nullableId = z.union([objectId, z.literal(''), z.null()]).transform((v) => v || null);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Enter task title').max(150),
  code: z.string().trim().toUpperCase().optional(),
  project: objectId,
  site: nullableId.optional(),
  description: text(2000).optional().default(''),
  milestone: nullableId.optional(),
  parentTask: nullableId.optional(),
  wbsCode: text(30).optional().default(''),
  workPackage: text(120).optional().default(''),
  assignedTo: nullableId.optional(),
  status: z.enum(Object.values(TASK_STATUS)).optional().default(TASK_STATUS.TODO),
  priority: z.enum(Object.values(TASK_PRIORITY)).optional().default(TASK_PRIORITY.MEDIUM),
  baselineStartDate: dateField.optional(),
  baselineDueDate: dateField.optional(),
  startDate: dateField.optional(),
  dueDate: dateField.optional(),
  estimatedHours: z.coerce.number().min(0).optional().default(0),
  actualHours: z.coerce.number().min(0).optional().default(0),
  weightPercent: z.coerce.number().min(0).max(100).optional().default(1),
  progressPercent: z.coerce.number().min(0).max(100).optional().default(0),
  dependencies: z.array(objectId).optional().default([]),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  site: nullableId.optional(),
  description: text(2000).optional(),
  milestone: nullableId.optional(),
  parentTask: nullableId.optional(),
  wbsCode: text(30).optional(),
  workPackage: text(120).optional(),
  assignedTo: nullableId.optional(),
  status: z.enum(Object.values(TASK_STATUS)).optional(),
  priority: z.enum(Object.values(TASK_PRIORITY)).optional(),
  baselineStartDate: dateField.optional(),
  baselineDueDate: dateField.optional(),
  startDate: dateField.optional(),
  dueDate: dateField.optional(),
  estimatedHours: z.coerce.number().min(0).optional(),
  actualHours: z.coerce.number().min(0).optional(),
  weightPercent: z.coerce.number().min(0).max(100).optional(),
  progressPercent: z.coerce.number().min(0).max(100).optional(),
  dependencies: z.array(objectId).optional(),
});

/* Milestones */
export const milestoneIdParams = z.object({ id: objectId });

export const listMilestonesQuery = z.object({
  q: text(100).optional(),
  project: objectId.optional(),
  status: z.enum(Object.values(MILESTONE_STATUS)).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().max(60).optional(),
});

export const createMilestoneSchema = z.object({
  title: z.string().trim().min(1, 'Enter milestone title').max(150),
  project: objectId,
  description: text(1000).optional().default(''),
  targetDate: z.string().min(1, 'Enter target date'),
  actualDate: dateField.optional(),
  status: z.enum(Object.values(MILESTONE_STATUS)).optional().default(MILESTONE_STATUS.PENDING),
  deliverables: z.array(z.string().trim().max(150)).optional().default([]),
  progressPercent: z.coerce.number().min(0).max(100).optional().default(0),
});

export const updateMilestoneSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  description: text(1000).optional(),
  targetDate: dateField.optional(),
  actualDate: dateField.optional(),
  status: z.enum(Object.values(MILESTONE_STATUS)).optional(),
  deliverables: z.array(z.string().trim().max(150)).optional(),
  progressPercent: z.coerce.number().min(0).max(100).optional(),
});

/* Baseline & Closure */
export const freezeBaselineSchema = z.object({
  notes: text(500).optional().default(''),
  rebaseline: z.boolean().optional().default(false),
});

export const closeProjectSchema = z.object({
  actualEndDate: dateField.optional(),
  forceClose: z.boolean().optional().default(false),
  closureChecklist: z
    .object({
      finalInspectionCompleted: z.boolean().optional(),
      punchListCleared: z.boolean().optional(),
      asBuiltSubmitted: z.boolean().optional(),
      finalAccountsSettled: z.boolean().optional(),
      clientHandoverCompleted: z.boolean().optional(),
      warrantyMonths: z.coerce.number().int().min(0).max(120).optional(),
      remarks: text(1000).optional(),
    })
    .optional()
    .default({}),
});

/* Risks */
export const riskParams = z.object({ id: objectId, riskId: objectId });

export const listRisksQuery = z.object({
  status: z.enum(Object.values(RISK_STATUS)).optional(),
  category: z.enum(Object.values(RISK_CATEGORY)).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  q: text(100).optional(),
});

export const createRiskSchema = z.object({
  title: z.string().trim().min(1, 'Enter risk title').max(160),
  description: text(2000).optional().default(''),
  category: z.enum(Object.values(RISK_CATEGORY)).optional().default(RISK_CATEGORY.TECHNICAL),
  probability: z.enum(Object.values(RISK_LEVEL)).optional().default(RISK_LEVEL.MEDIUM),
  impact: z.enum(Object.values(RISK_LEVEL)).optional().default(RISK_LEVEL.MEDIUM),
  mitigationPlan: text(2000).optional().default(''),
  owner: nullableId.optional(),
  dueDate: dateField.optional(),
  status: z.enum(Object.values(RISK_STATUS)).optional().default(RISK_STATUS.OPEN),
});

export const updateRiskSchema = createRiskSchema.partial();

/* Change Orders & Variation Orders */
export const changeOrderParams = z.object({ id: objectId, changeId: objectId });

export const listChangeOrdersQuery = z.object({
  status: z.enum(Object.values(APPROVAL_STATUS)).optional(),
  type: z.enum(Object.values(CHANGE_ORDER_TYPE)).optional(),
  q: text(100).optional(),
});

export const createChangeOrderSchema = z.object({
  title: z.string().trim().min(1, 'Enter change order title').max(160),
  description: text(2000).optional().default(''),
  type: z.enum(Object.values(CHANGE_ORDER_TYPE)).optional().default(CHANGE_ORDER_TYPE.COMBINED),
  costImpact: z.coerce.number().min(-1e12).max(1e12).optional().default(0),
  scheduleImpactDays: z.coerce.number().int().min(-3650).max(3650).optional().default(0),
  reason: text(1000).optional().default(''),
  clientApprovalRequired: z.boolean().optional().default(false),
  clientApproved: z.boolean().optional().default(false),
});

export const updateChangeOrderSchema = createChangeOrderSchema.partial();

export const transitionChangeOrderSchema = z.object({
  status: z.enum(Object.values(APPROVAL_STATUS)),
  comment: text(1000).optional(),
  clientApproved: z.boolean().optional(),
});
