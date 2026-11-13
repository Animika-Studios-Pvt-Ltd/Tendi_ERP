import mongoose from 'mongoose';

const { Schema } = mongoose;

const checklistItemSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 200 },
    status: { type: String, enum: ['pass', 'fail', 'na'], default: 'pass' },
    remarks: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: false },
);

const qualityInspectionSchema = new Schema(
  {
    inspectionNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    workPackage: { type: String, trim: true, maxlength: 120, default: '' },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    inspectionType: { type: String, enum: ['material', 'workmanship', 'structural', 'finishing', 'mep'], default: 'structural' },
    checklistItems: { type: [checklistItemSchema], default: [] },
    overallResult: { type: String, enum: ['pass', 'conditional', 'fail'], default: 'pass' },
    inspectedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['scheduled', 'completed'], default: 'completed' },
    inspector: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true },
);

const ncrSchema = new Schema(
  {
    ncrNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    severity: { type: String, enum: ['minor', 'major', 'critical'], default: 'major', index: true },
    category: { type: String, trim: true, maxlength: 80, default: 'Workmanship' },
    rootCause: { type: String, trim: true, maxlength: 1000, default: '' },
    correctiveAction: { type: String, trim: true, maxlength: 1000, default: '' },
    dueDate: Date,
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['open', 'in_progress', 'rectified', 'verified', 'closed'], default: 'open', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const safetyIncidentSchema = new Schema(
  {
    incidentNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    incidentType: {
      type: String,
      enum: ['near_miss', 'first_aid', 'medical_treatment', 'lti', 'property_damage', 'toolbox_talk'],
      default: 'near_miss',
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
    incidentDate: { type: Date, default: Date.now, index: true },
    injuredPerson: { type: String, trim: true, maxlength: 120, default: '' },
    attendeesCount: { type: Number, min: 0, default: 0 },
    ppeCompliant: { type: Boolean, default: true },
    correctiveAction: { type: String, trim: true, maxlength: 1000, default: '' },
    status: { type: String, enum: ['open', 'investigating', 'closed'], default: 'open', index: true },
    reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const QualityInspection =
  mongoose.models.QualityInspection || mongoose.model('QualityInspection', qualityInspectionSchema);
export const NonConformanceReport =
  mongoose.models.NonConformanceReport || mongoose.model('NonConformanceReport', ncrSchema);
export const SafetyIncident =
  mongoose.models.SafetyIncident || mongoose.model('SafetyIncident', safetyIncidentSchema);

