import mongoose from 'mongoose';
import { MODULE_LIST } from '../config/rbac.js';

const { Schema } = mongoose;

export const NOTIFICATION_TYPES = Object.freeze({
  APPROVAL_REQUIRED: 'approval_required',
  APPROVAL_DECIDED: 'approval_decided',
  ALERT: 'alert',
  INFO: 'info',
});

const notificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPES),
      default: NOTIFICATION_TYPES.INFO,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, trim: true, maxlength: 500, default: '' },
    module: { type: String, enum: [...MODULE_LIST, 'system'] },
    entityType: { type: String, trim: true, maxlength: 60 },
    entityId: { type: Schema.Types.ObjectId },
    project: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    link: { type: String, trim: true, maxlength: 250, default: '' },
    isRead: { type: Boolean, default: false, index: true },
    readAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

export const Notification =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

