import { AuditLog } from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';

/**
 * Writes an audit entry without blocking or failing the request.
 * entry: { actor, action, module, entityType?, entityId?, project?, summary?, changes? }
 */
export function recordAudit(req, entry) {
  AuditLog.create({
    ...entry,
    actor: entry.actor ?? req?.user?._id,
    ip: req?.ip,
    userAgent: req?.get?.('user-agent')?.slice(0, 300),
  }).catch((error) => logger.warn('Audit log write failed:', error.message));
}
