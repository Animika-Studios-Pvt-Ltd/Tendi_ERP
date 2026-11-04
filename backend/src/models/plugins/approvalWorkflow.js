import mongoose from 'mongoose';
import { ApiError } from '../../utils/ApiError.js';

const { Schema } = mongoose;

/**
 * Shared approval lifecycle for material requests, daily progress reports,
 * expenses, contractor bills and purchase orders.
 */
export const APPROVAL_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

const S = APPROVAL_STATUS;

export const DEFAULT_TRANSITIONS = Object.freeze({
  [S.DRAFT]: [S.SUBMITTED, S.CANCELLED],
  [S.SUBMITTED]: [S.UNDER_REVIEW, S.APPROVED, S.REJECTED, S.CANCELLED],
  [S.UNDER_REVIEW]: [S.APPROVED, S.REJECTED],
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

/**
 * Usage: schema.plugin(approvalWorkflowPlugin, { transitions? })
 * Adds status, ownership and history fields plus doc.transitionTo(status, userId, comment).
 * Permission checks (who may approve) stay in the service layer via authorize().
 */
export function approvalWorkflowPlugin(schema, { transitions = DEFAULT_TRANSITIONS } = {}) {
  schema.add({
    status: { type: String, enum: Object.values(S), default: S.DRAFT, index: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    submittedAt: Date,
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
    decisionComment: { type: String, trim: true, maxlength: 1000 },
    approvalHistory: { type: [historyEntrySchema], default: [] },
  });

  schema.methods.canTransitionTo = function canTransitionTo(toStatus) {
    return (transitions[this.status] ?? []).includes(toStatus);
  };

  schema.methods.transitionTo = function transitionTo(toStatus, userId, comment) {
    if (!this.canTransitionTo(toStatus)) {
      throw ApiError.badRequest(`Cannot move from "${this.status}" to "${toStatus}"`);
    }
    if (toStatus === S.REJECTED && !comment) {
      throw ApiError.badRequest('A reason is required when rejecting');
    }

    const now = new Date();
    this.approvalHistory.push({ fromStatus: this.status, toStatus, by: userId, comment, at: now });

    if (toStatus === S.SUBMITTED) {
      this.submittedBy = userId;
      this.submittedAt = now;
    }
    if (toStatus === S.APPROVED || toStatus === S.REJECTED) {
      this.decidedBy = userId;
      this.decidedAt = now;
      this.decisionComment = comment;
    }
    this.status = toStatus;
    return this;
  };
}
