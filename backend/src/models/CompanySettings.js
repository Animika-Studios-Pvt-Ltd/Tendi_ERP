import mongoose from 'mongoose';

const { Schema } = mongoose;

const numberingRuleSchema = new Schema(
  {
    prefix: { type: String, required: true, trim: true, uppercase: true, maxlength: 15 },
    nextNumber: { type: Number, required: true, min: 1, default: 1 },
    padding: { type: Number, required: true, min: 2, max: 8, default: 3 },
  },
  { _id: false },
);

const approvalLimitSchema = new Schema(
  {
    module: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    pmLimit: { type: Number, min: 0, default: 100000 },
    requireAdminAboveLimit: { type: Boolean, default: true },
  },
  { _id: false },
);

const companySettingsSchema = new Schema(
  {
    key: { type: String, default: 'default', unique: true, immutable: true },
    companyProfile: {
      name: { type: String, trim: true, maxlength: 120, default: 'Ten.Di Construction Pvt. Ltd.' },
      legalName: { type: String, trim: true, maxlength: 150, default: 'Ten.Di Constructions Private Limited' },
      gstin: { type: String, trim: true, uppercase: true, maxlength: 20, default: '' },
      pan: { type: String, trim: true, uppercase: true, maxlength: 15, default: '' },
      email: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
      phone: { type: String, trim: true, maxlength: 20, default: '' },
      website: { type: String, trim: true, maxlength: 120, default: '' },
      address: { type: String, trim: true, maxlength: 300, default: '' },
      city: { type: String, trim: true, maxlength: 80, default: '' },
      state: { type: String, trim: true, maxlength: 80, default: '' },
      pincode: { type: String, trim: true, maxlength: 10, default: '' },
    },
    preferences: {
      currency: { type: String, trim: true, uppercase: true, default: 'INR' },
      financialYearStartMonth: { type: Number, min: 1, max: 12, default: 4 },
      dateFormat: { type: String, default: 'DD MMM YYYY' },
    },
    numberingSeries: {
      project: { type: numberingRuleSchema, default: () => ({ prefix: 'PRJ', nextNumber: 1, padding: 3 }) },
      estimate: { type: numberingRuleSchema, default: () => ({ prefix: 'EST', nextNumber: 1, padding: 3 }) },
      tender: { type: numberingRuleSchema, default: () => ({ prefix: 'TND', nextNumber: 1, padding: 3 }) },
      site: { type: numberingRuleSchema, default: () => ({ prefix: 'SITE', nextNumber: 1, padding: 3 }) },
      dpr: { type: numberingRuleSchema, default: () => ({ prefix: 'DPR', nextNumber: 1, padding: 3 }) },
      materialRequest: { type: numberingRuleSchema, default: () => ({ prefix: 'MR', nextNumber: 1, padding: 4 }) },
      purchaseOrder: { type: numberingRuleSchema, default: () => ({ prefix: 'PO', nextNumber: 1, padding: 4 }) },
      goodsReceipt: { type: numberingRuleSchema, default: () => ({ prefix: 'GRN', nextNumber: 1, padding: 4 }) },
      expense: { type: numberingRuleSchema, default: () => ({ prefix: 'EXP', nextNumber: 1, padding: 4 }) },
      invoice: { type: numberingRuleSchema, default: () => ({ prefix: 'INV', nextNumber: 1, padding: 4 }) },
    },
    approvalLimits: {
      type: [approvalLimitSchema],
      default: () => [
        { module: 'procurement', label: 'Purchase Orders (PO)', pmLimit: 250000, requireAdminAboveLimit: true },
        { module: 'finance', label: 'Site Expenses', pmLimit: 50000, requireAdminAboveLimit: true },
        { module: 'contractors', label: 'Contractor Bills', pmLimit: 500000, requireAdminAboveLimit: true },
      ],
    },
    masterData: {
      units: {
        type: [String],
        default: () => ['bags', 'tonnes', 'kg', 'cu.m', 'sq.ft', 'rft', 'nos', 'liters', 'hours', 'days'],
      },
      materialCategories: {
        type: [String],
        default: () => [
          'Cement & Concrete',
          'Steel & Reinforcement',
          'Aggregates & Sand',
          'Bricks & Blocks',
          'Electrical',
          'Plumbing & Sanitary',
          'Finishing & Paint',
          'Safety & PPE',
        ],
      },
      costHeads: {
        type: [String],
        default: () => [
          'Substructure & Excavation',
          'Superstructure & RCC',
          'Masonry & Plastering',
          'MEP Works',
          'Finishing & Flooring',
          'Site Overheads',
          'Machinery & Equipment',
        ],
      },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

companySettingsSchema.statics.getSettings = async function getSettings() {
  let doc = await this.findOne({ key: 'default' });
  if (!doc) {
    doc = await this.create({ key: 'default' });
  }
  return doc;
};

export const CompanySettings =
  mongoose.models.CompanySettings || mongoose.model('CompanySettings', companySettingsSchema);

