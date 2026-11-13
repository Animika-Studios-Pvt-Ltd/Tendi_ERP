import mongoose from 'mongoose';

const { Schema } = mongoose;

const equipmentSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 24 },
    name: { type: String, required: true, trim: true, maxlength: 140 },
    category: { type: String, trim: true, maxlength: 80, default: 'Heavy Machinery' },
    ownershipType: { type: String, enum: ['owned', 'rented', 'leased'], default: 'owned' },
    vendorRef: { type: Schema.Types.ObjectId, ref: 'Vendor', default: null },
    dailyRate: { type: Number, min: 0, default: 0 },
    hourlyRate: { type: Number, min: 0, default: 0 },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    assignedOperator: { type: String, trim: true, maxlength: 120, default: '' },
    lastServiceDate: Date,
    nextServiceDueDate: Date,
    status: { type: String, enum: ['available', 'deployed', 'maintenance', 'retired'], default: 'available', index: true },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const equipmentLogSchema = new Schema(
  {
    equipment: { type: Schema.Types.ObjectId, ref: 'Equipment', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    logDate: { type: Date, default: Date.now, index: true },
    logType: { type: String, enum: ['usage', 'fuel', 'maintenance', 'breakdown'], default: 'usage' },
    hoursOperated: { type: Number, min: 0, max: 24, default: 0 },
    fuelLiters: { type: Number, min: 0, default: 0 },
    fuelCost: { type: Number, min: 0, default: 0 },
    maintenanceCost: { type: Number, min: 0, default: 0 },
    rentalCost: { type: Number, min: 0, default: 0 },
    operatorName: { type: String, trim: true, maxlength: 120, default: '' },
    maintenanceType: { type: String, enum: ['preventive', 'breakdown', 'none'], default: 'none' },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    resolved: { type: Boolean, default: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const Equipment = mongoose.models.Equipment || mongoose.model('Equipment', equipmentSchema);
export const EquipmentLog = mongoose.models.EquipmentLog || mongoose.model('EquipmentLog', equipmentLogSchema);

