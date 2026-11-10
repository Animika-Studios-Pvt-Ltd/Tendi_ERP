import mongoose from 'mongoose';
import { ApiError } from '../../utils/ApiError.js';

const { Schema } = mongoose;

/**
 * Shared approval lifecycle for material requests, daily progress reports,
 * expenses, contractor bills, purchase orders, change orders and estimates.
 */
export const APPROVAL_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  RETURNED: 'returned',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

const S = APPROVAL_STATUS;

export const DEFAULT_TRANSITIONS = Object.freeze({
  [S.DRAFT]: [S.SUBMITTED, S.CANCELLED],
  [S.SUBMITTED]: [S.UNDER_REVIEW, S.APPROVED, S.REJECTED, S.RETURNED, S.CANCELLED],
  [S.UNDER_REVIEW]: [S.APPROVED, S.REJECTED, S.RETURNED, S.CANCELLED],
  [S.RETURNED]: [S.SUBMITTED, S.CANCELLED],
  [S.REJECTED]: [S.SUBMITTED, S.CANCELLED],
  [S.APPROVED]: [],
  [S.CANCELLED]: [],
});

const historyEntrySchema = new Schema(
  {
    fromStatus: { type: String, required: true },
    toStatus: { type: String, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    comment: { type: String, trim: true, maxlength: 1000 },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const approvalStepSchema = new Schema(
  {
    stepOrder: { type: Number, required: true, min: 1 },
    label: { type: String, trim: true, maxlength: 80 },
    roleKey: { type: String, trim: true },
    approver: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'returned', 'skipped'], default: 'pending' },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
    comment: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

/**
 * Usage: schema.plugin(approvalWorkflowPlugin, { transitions? })
 * Adds status, ownership, delegation, escalation, multi-step tracking and history fields
 * plus doc.transitionTo(status, userId, comment).
 * Role/permission & authority checks are enforced by approval.service.js.
 */
export function approvalWorkflowPlugin(schema, { transitions = DEFAULT_TRANSITIONS } = {}) {
  schema.add({
    status: { type: String, enum: Object.values(S), default: S.DRAFT, index: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    submittedAt: Date,
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
    decisionComment: { type: String, trim: true, maxlength: 1000 },
    delegatedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    delegatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    delegatedAt: Date,
    escalatedAt: Date,
    escalatedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    currentStepIndex: { type: Number, default: 0, min: 0 },
    approvalSteps: { type: [approvalStepSchema], default: [] },
    approvalHistory: { type: [historyEntrySchema], default: [] },
  });

  schema.methods.canTransitionTo = function canTransitionTo(toStatus) {
    return (transitions[this.status] ?? []).includes(toStatus);
  };

  schema.methods.transitionTo = function transitionTo(toStatus, userId, comment) {
    if (!this.canTransitionTo(toStatus)) {
      throw ApiError.badRequest(`Cannot move from "${this.status}" to "${toStatus}"`);
    }
    if ((toStatus === S.REJECTED || toStatus === S.RETURNED) && !String(comment || '').trim()) {
      throw ApiError.badRequest(
        toStatus === S.RETURNED
          ? 'A reason is required when returning for correction'
          : 'A reason is required when rejecting',
      );
    }

    const now = new Date();
    this.approvalHistory.push({ fromStatus: this.status, toStatus, by: userId, comment, at: now });

    if (toStatus === S.SUBMITTED) {
      this.submittedBy = userId;
      this.submittedAt = now;
      this.decidedBy = undefined;
      this.decidedAt = undefined;
      this.decisionComment = undefined;
    }
    if (toStatus === S.APPROVED || toStatus === S.REJECTED || toStatus === S.RETURNED) {
      this.decidedBy = userId;
      this.decidedAt = now;
      this.decisionComment = comment;
    }
    this.status = toStatus;
    return this;
  };
}
