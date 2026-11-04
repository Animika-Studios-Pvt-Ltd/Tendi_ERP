import { DATA_SCOPES } from '../config/rbac.js';

/**
 * Restricts a query to the projects a user may see. Every project-bound list/read
 * query in module services must merge this filter:
 *
 *   const filter = { ...buildProjectScope(req.user), status: 'active' };
 *
 * Use projectField "_id" when querying the Project model itself.
 */
export function buildProjectScope(user, { projectField = 'project' } = {}) {
  const scope = user?.role?.dataScope;
  if (scope === DATA_SCOPES.ALL) return {};
  if (scope === DATA_SCOPES.ASSIGNED || scope === DATA_SCOPES.OWN) {
    return { [projectField]: { $in: user.assignedProjects ?? [] } };
  }
  // Unknown scope: match nothing rather than leak data.
  return { _id: null };
}

/**
 * Additional restriction for portal users (dataScope "own"): limits records to
 * those they own, e.g. a contractor's own bills. Returns {} for other scopes.
 */
export function buildOwnershipScope(user, ownerFilter) {
  if (user?.role?.dataScope !== DATA_SCOPES.OWN) return {};
  return ownerFilter;
}

export function canAccessProject(user, projectId) {
  if (user?.role?.dataScope === DATA_SCOPES.ALL) return true;
  return (user?.assignedProjects ?? []).some((id) => String(id) === String(projectId));
}
