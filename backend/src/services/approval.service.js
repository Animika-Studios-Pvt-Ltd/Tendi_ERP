import { ACTIONS, ROLES } from '../config/rbac.js';
import { CompanySettings } from '../models/CompanySettings.js';
import { APPROVAL_STATUS } from '../models/plugins/approvalWorkflow.js';
import { ApiError } from '../utils/ApiError.js';

const hasPerm = (user, module, action) => {
  if (!user) return false;
  if (typeof user.can === 'function') return user.can(module, action);
  if (user.role && typeof user.role.can === 'function') return user.role.can(module, action);
  return false;
};

const isAdminRole = (user) => [ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN].includes(user?.role?.key);

/**
 * Shared RBAC, maker-checker, delegation, and approval-limit gate for every module using
 * approvalWorkflowPlugin. Prevents users with only create/update permissions from self-approving
 * or executing approve/reject/return transitions.
 */
export async function assertTransitionPermission(
  user,
  doc,
  { module, targetStatus, amount = null, makerChecker = true } = {},
) {
  if (!user?.role) throw ApiError.unauthorized();

  const S = APPROVAL_STATUS;
  const isDelegatedApprover = doc?.delegatedTo && String(doc.delegatedTo) === String(user._id);

  if (targetStatus === S.SUBMITTED) {
    if (!hasPerm(user, module, ACTIONS.CREATE) && !hasPerm(user, module, ACTIONS.UPDATE)) {
      throw ApiError.forbidden(`Your role cannot submit records in ${module}`);
    }
    return;
  }

  if (targetStatus === S.UNDER_REVIEW) {
    if (!hasPerm(user, module, ACTIONS.APPROVE) && !hasPerm(user, module, ACTIONS.UPDATE) && !isDelegatedApprover) {
      throw ApiError.forbidden(`Your role cannot move records to review in ${module}`);
    }
    return;
  }

  if (targetStatus === S.APPROVED) {
    if (!hasPerm(user, module, ACTIONS.APPROVE) && !isDelegatedApprover) {
      throw ApiError.forbidden(`Your role cannot approve in ${module}`);
    }

    if (makerChecker && doc?.submittedBy && String(doc.submittedBy) === String(user._id) && !isAdminRole(user)) {
      throw ApiError.forbidden('Maker-checker policy: you cannot approve a submission you submitted yourself');
    }

    if (amount != null && !isAdminRole(user)) {
      const settings = await CompanySettings.getSettings();
      const limitRule = settings?.approvalLimits?.find((l) => l.module === module);
      if (limitRule && limitRule.requireAdminAboveLimit && Number(amount) > limitRule.pmLimit) {
        throw ApiError.forbidden(
          `Amount (${amount}) exceeds the Project Manager limit (${limitRule.pmLimit}). Admin approval is required.`,
        );
      }
    }
    return;
  }

  if (targetStatus === S.REJECTED || targetStatus === S.RETURNED) {
    const canDecide =
      hasPerm(user, module, ACTIONS.REJECT) ||
      (targetStatus === S.RETURNED && hasPerm(user, module, ACTIONS.APPROVE)) ||
      isDelegatedApprover;
    if (!canDecide) {
      throw ApiError.forbidden(`Your role cannot ${targetStatus === S.RETURNED ? 'return' : 'reject'} in ${module}`);
    }
    return;
  }

  if (targetStatus === S.CANCELLED) {
    const isCreator = doc?.createdBy && String(doc.createdBy) === String(user._id);
    if (!isCreator && !hasPerm(user, module, ACTIONS.UPDATE) && !hasPerm(user, module, ACTIONS.DELETE)) {
      throw ApiError.forbidden(`Your role cannot cancel records in ${module}`);
    }
  }
}

/**
 * Applies multi-step approval progression if approvalSteps are configured, or delegates/escalates.
 * Falls back cleanly to single-step transitionTo when approvalSteps is empty.
 */
export async function executeApprovalTransition(
  user,
  doc,
  { module, targetStatus, comment, amount = null, makerChecker = true } = {},
) {
  await assertTransitionPermission(user, doc, { module, targetStatus, amount, makerChecker });

  const steps = Array.isArray(doc.approvalSteps) ? doc.approvalSteps : [];
  if (steps.length > 0 && targetStatus === APPROVAL_STATUS.APPROVED) {
    const currentIdx = doc.currentStepIndex ?? 0;
    const step = steps[currentIdx];
    if (step && step.status === 'pending') {
      if (step.roleKey && user.role?.key !== step.roleKey && !isAdminRole(user)) {
        throw ApiError.forbidden(`Step ${step.stepOrder} requires role "${step.roleKey}" approval`);
      }
      step.status = 'approved';
      step.decidedBy = user._id;
      step.decidedAt = new Date();
      step.comment = comment;

      const nextPendingIdx = steps.findIndex((s, idx) => idx > currentIdx && s.status === 'pending');
      if (nextPendingIdx !== -1) {
        doc.currentStepIndex = nextPendingIdx;
        // Keep in under_review until final step completes
        if (doc.status === APPROVAL_STATUS.SUBMITTED) {
          doc.transitionTo(APPROVAL_STATUS.UNDER_REVIEW, user._id, comment || `Step ${step.stepOrder} approved`);
        } else {
          doc.approvalHistory.push({
            fromStatus: doc.status,
            toStatus: doc.status,
            by: user._id,
            comment: comment || `Step ${step.stepOrder} approved; awaiting step ${steps[nextPendingIdx].stepOrder}`,
            at: new Date(),
          });
        }
        return doc;
      }
    }
  }

  doc.transitionTo(targetStatus, user._id, comment);
  return doc;
}
