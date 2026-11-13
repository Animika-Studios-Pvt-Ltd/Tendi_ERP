import mongoose from 'mongoose';
import { approvalWorkflowPlugin } from './plugins/approvalWorkflow.js';

const { Schema } = mongoose;

export const WEATHER_CONDITIONS = Object.freeze({
  SUNNY: 'sunny',
  CLOUDY: 'cloudy',
  RAINY: 'rainy',
  WINDY: 'windy',
  STORMY: 'stormy',
  EXTREME_HEAT: 'extreme_heat',
});

export const WEATHER_IMPACTS = Object.freeze({
  NONE: 'none',
  MINOR_DELAY: 'minor_delay',
  HALF_DAY_LOSS: 'half_day_loss',
  FULL_DAY_LOSS: 'full_day_loss',
});

const workDoneItemSchema = new Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 500 },
    locationOrGrid: { type: String, trim: true, maxlength: 100, default: '' },
    quantity: { type: Number, default: 0, min: 0 },
    unit: { type: String, trim: true, maxlength: 30, default: '' },
    status: { type: String, enum: ['in_progress', 'completed', 'blocked'], default: 'in_progress' },
  },
  { _id: false },
);

const labourItemSchema = new Schema(
  {
    trade: { type: String, required: true, trim: true, maxlength: 60 },
    headcount: { type: Number, required: true, min: 0 },
    hoursWorked: { type: Number, default: 8, min: 0, max: 24 },
    contractorName: { type: String, trim: true, maxlength: 120, default: '' },
  },
  { _id: false },
);

const materialItemSchema = new Schema(
  {
    material: { type: Schema.Types.ObjectId, ref: 'Material', default: null },
    materialName: { type: String, required: true, trim: true, maxlength: 120 },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true, trim: true, maxlength: 30 },
    inventoryTx: { type: Schema.Types.ObjectId, ref: 'InventoryTransaction', default: null },
    notes: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { _id: false },
);

const equipmentItemSchema = new Schema(
  {
    equipment: { type: Schema.Types.ObjectId, ref: 'Equipment', default: null },
    equipmentName: { type: String, required: true, trim: true, maxlength: 120 },
    hoursOperated: { type: Number, required: true, min: 0, max: 24 },
    status: { type: String, enum: ['operational', 'breakdown', 'idle'], default: 'operational' },
  },
  { _id: false },
);

const siteIssueSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    actionPlan: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: false },
);

const photoSchema = new Schema(
  {
    url: { type: String, default: '' },
    caption: { type: String, trim: true, maxlength: 200, default: '' },
    key: String,
    provider: String,
    resourceType: String,
    format: String,
    mimeType: String,
    size: Number,
    originalName: String,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const dprSchema = new Schema(
  {
    reportNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    reportDate: { type: Date, required: true, index: true },

    weather: {
      condition: { type: String, enum: Object.values(WEATHER_CONDITIONS), default: WEATHER_CONDITIONS.SUNNY },
      temperature: { type: Number, default: 28 },
      weatherImpact: { type: String, enum: Object.values(WEATHER_IMPACTS), default: WEATHER_IMPACTS.NONE },
    },

    workDone: { type: [workDoneItemSchema], default: [] },
    labourAttendance: { type: [labourItemSchema], default: [] },
    materialUsage: { type: [materialItemSchema], default: [] },
    equipmentUsage: { type: [equipmentItemSchema], default: [] },
    siteIssues: { type: [siteIssueSchema], default: [] },
    photos: { type: [photoSchema], default: [] },
    inventoryPosted: { type: Boolean, default: false },
    postedAt: Date,
    remarks: { type: String, trim: true, maxlength: 1000, default: '' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

dprSchema.plugin(approvalWorkflowPlugin);

dprSchema.index({ project: 1, reportDate: -1 });
dprSchema.index({ site: 1, reportDate: -1 });

export const DailyProgressReport =
  mongoose.models.DailyProgressReport || mongoose.model('DailyProgressReport', dprSchema);

