import mongoose from 'mongoose';

const { Schema } = mongoose;

const clientSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 24 },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    contactPerson: { type: String, trim: true, maxlength: 120, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    gstin: { type: String, trim: true, uppercase: true, maxlength: 20, default: '' },
    address: { type: String, trim: true, maxlength: 300, default: '' },
    city: { type: String, trim: true, maxlength: 80, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const enquirySchema = new Schema(
  {
    enquiryNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    clientName: { type: String, required: true, trim: true, maxlength: 150 },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    location: { type: String, trim: true, maxlength: 160, default: '' },
    estimatedValue: { type: Number, min: 0, default: 0 },
    stage: {
      type: String,
      enum: ['new', 'site_visit', 'proposal', 'negotiation', 'won', 'lost'],
      default: 'new',
      index: true,
    },
    estimateRef: { type: Schema.Types.ObjectId, ref: 'Estimate', default: null },
    projectRef: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    followUpDate: Date,
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    owner: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

const complaintSchema = new Schema(
  {
    complaintNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    subject: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open', index: true },
    resolution: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

const handoverSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, unique: true },
    client: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    handoverDate: { type: Date, default: Date.now },
    warrantyMonths: { type: Number, min: 0, max: 120, default: 12 },
    warrantyEndDate: Date,
    snagsCleared: { type: Boolean, default: false },
    certificatesIssued: { type: Boolean, default: false },
    defectsLiabilityStatus: { type: String, enum: ['active', 'completed'], default: 'active' },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const Client = mongoose.models.Client || mongoose.model('Client', clientSchema);
export const Enquiry = mongoose.models.Enquiry || mongoose.model('Enquiry', enquirySchema);
export const ClientComplaint =
  mongoose.models.ClientComplaint || mongoose.model('ClientComplaint', complaintSchema);
export const ProjectHandover =
  mongoose.models.ProjectHandover || mongoose.model('ProjectHandover', handoverSchema);

