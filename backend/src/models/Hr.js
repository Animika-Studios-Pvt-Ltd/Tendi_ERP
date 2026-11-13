import mongoose from 'mongoose';
import { approvalWorkflowPlugin } from './plugins/approvalWorkflow.js';

const { Schema } = mongoose;

export const WORKER_CATEGORIES = Object.freeze({
  COMPANY_EMPLOYEE: 'company_employee',
  DAILY_WAGE_LABOUR: 'daily_wage_labour',
  CONTRACTOR_LABOUR: 'contractor_labour',
  OUTSOURCED: 'outsourced',
});

const employeeSchema = new Schema(
  {
    empCode: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 24 },
    fullName: { type: String, required: true, trim: true, maxlength: 140 },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
    workerCategory: {
      type: String,
      enum: Object.values(WORKER_CATEGORIES),
      default: WORKER_CATEGORIES.COMPANY_EMPLOYEE,
      index: true,
    },
    contractorRef: { type: Schema.Types.ObjectId, ref: 'Contractor', default: null },
    userRef: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    department: { type: String, trim: true, maxlength: 80, default: 'Site Operations' },
    designation: { type: String, trim: true, maxlength: 80, default: 'Worker' },
    trade: { type: String, trim: true, maxlength: 60, default: '' },
    wageType: { type: String, enum: ['monthly', 'daily', 'hourly'], default: 'daily' },
    baseRate: { type: Number, required: true, min: 0, default: 600 },
    overtimeRate: { type: Number, min: 0, default: 100 },
    statutory: {
      pfNumber: { type: String, trim: true, default: '' },
      esicNumber: { type: String, trim: true, default: '' },
      uan: { type: String, trim: true, default: '' },
      pan: { type: String, trim: true, uppercase: true, default: '' },
    },
    assignedProjects: [{ type: Schema.Types.ObjectId, ref: 'Project' }],
    status: { type: String, enum: ['active', 'inactive', 'terminated'], default: 'active', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const attendanceSchema = new Schema(
  {
    employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    site: { type: Schema.Types.ObjectId, ref: 'Site', default: null },
    date: { type: Date, required: true, index: true },
    shiftName: { type: String, trim: true, default: 'Day Shift' },
    status: { type: String, enum: ['present', 'absent', 'half_day', 'leave'], default: 'present' },
    regularHours: { type: Number, min: 0, max: 24, default: 8 },
    overtimeHours: { type: Number, min: 0, max: 12, default: 0 },
    notes: { type: String, trim: true, maxlength: 300, default: '' },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
attendanceSchema.index({ employee: 1, project: 1, date: 1 }, { unique: true });

const leaveRequestSchema = new Schema(
  {
    employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    leaveType: { type: String, enum: ['casual', 'sick', 'earned', 'unpaid'], default: 'casual' },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    days: { type: Number, required: true, min: 0.5 },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
leaveRequestSchema.plugin(approvalWorkflowPlugin);

const payslipEntrySchema = new Schema(
  {
    employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    empCode: String,
    fullName: String,
    workerCategory: String,
    presentDays: { type: Number, min: 0, default: 0 },
    overtimeHours: { type: Number, min: 0, default: 0 },
    grossWage: { type: Number, min: 0, default: 0 },
    overtimePay: { type: Number, min: 0, default: 0 },
    pfDeduction: { type: Number, min: 0, default: 0 },
    esicDeduction: { type: Number, min: 0, default: 0 },
    advanceDeduction: { type: Number, min: 0, default: 0 },
    netPayable: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const payrollRunSchema = new Schema(
  {
    runNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    month: { type: String, required: true, match: [/^\d{4}-\d{2}$/, 'Use YYYY-MM month format'] },
    entries: { type: [payslipEntrySchema], default: [] },
    totalGross: { type: Number, min: 0, default: 0 },
    totalNet: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
payrollRunSchema.plugin(approvalWorkflowPlugin);

export const Employee = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);
export const AttendanceRecord =
  mongoose.models.AttendanceRecord || mongoose.model('AttendanceRecord', attendanceSchema);
export const LeaveRequest =
  mongoose.models.LeaveRequest || mongoose.model('LeaveRequest', leaveRequestSchema);
export const PayrollRun = mongoose.models.PayrollRun || mongoose.model('PayrollRun', payrollRunSchema);

