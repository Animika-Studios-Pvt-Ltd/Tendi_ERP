import { AlertCircle, Check, Info, Lock, Save, Shield, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { rolesService } from '@/services/roles.service';

const ALL_MODULES = Object.values(MODULES);
const ALL_ACTIONS = Object.values(ACTIONS);

export default function RolePermissionsModal({ role, isOpen, onClose, isSuperAdmin = false, onUpdated }) {
  const [permissions, setPermissions] = useState({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Initialize permissions map when role opens
  useEffect(() => {
    if (!role) return;
    const map = {};
    for (const mod of ALL_MODULES) {
      map[mod] = new Set();
    }
    if (Array.isArray(role.permissions)) {
      for (const p of role.permissions) {
        if (map[p.module]) {
          for (const a of p.actions || []) map[p.module].add(a);
        }
      }
    } else if (role.permissions && typeof role.permissions === 'object') {
      for (const [mod, acts] of Object.entries(role.permissions)) {
        if (map[mod] && Array.isArray(acts)) {
          for (const a of acts) map[mod].add(a);
        }
      }
    }
    setPermissions(map);
    setErrorMsg(null);
    setSuccessMsg(null);
  }, [role]);

  // Compute if permissions changed
  const hasChanges = useMemo(() => {
    if (!role) return false;
    const original = {};
    if (Array.isArray(role.permissions)) {
      for (const p of role.permissions) original[p.module] = new Set(p.actions || []);
    } else if (role.permissions && typeof role.permissions === 'object') {
      for (const [m, acts] of Object.entries(role.permissions)) original[m] = new Set(acts || []);
    }
    for (const mod of ALL_MODULES) {
      const origSet = original[mod] || new Set();
      const currSet = permissions[mod] || new Set();
      if (origSet.size !== currSet.size) return true;
      for (const a of currSet) {
        if (!origSet.has(a)) return true;
      }
    }
    return false;
  }, [role, permissions]);

  if (!isOpen || !role) return null;

  const toggleAction = (module, action) => {
    if (!isSuperAdmin) return;
    setPermissions((prev) => {
      const next = { ...prev };
      const set = new Set(next[module] || []);
      if (set.has(action)) {
        set.delete(action);
      } else {
        set.add(action);
      }
      next[module] = set;
      return next;
    });
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      // Convert map to array of { module, actions: [...] }
      const entries = Object.entries(permissions).map(([module, actionSet]) => ({
        module,
        actions: Array.from(actionSet),
      }));

      await rolesService.update(role.id || role.key, { permissions: entries });
      setSuccessMsg('Role permissions updated successfully. Changes apply to all users without individual overrides.');
      if (onUpdated) onUpdated();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update role permissions.');
    } finally {
      setSaving(false);
    }
  };

  const filteredModules = ALL_MODULES.filter((m) =>
    m.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-surface rounded-xl shadow-xl border border-line">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Shield size={20} className="text-navy-600" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-ink">{role.name} Permissions</h3>
                {role.isSystem && (
                  <Badge tone="neutral" className="gap-1 text-2xs">
                    <Lock size={10} /> System Role
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted">
                Key: <span className="font-mono">{role.key}</span> &bull; Data Scope:{' '}
                <span className="capitalize">{role.dataScope}</span> &bull; Assigned Users:{' '}
                <span className="font-semibold">{role.userCount ?? 0}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-subtle transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Info & Rule Notice */}
        <div className="px-6 py-3 border-b border-line bg-surface-subtle/50 text-xs text-muted flex items-start gap-2.5">
          <Info size={16} className="mt-0.5 shrink-0 text-navy-600" />
          <div className="space-y-0.5">
            <p className="font-semibold text-ink">Role Inheritance Business Rule</p>
            <p>
              Modifications to role-level permissions apply immediately to all employees assigned to this role,
              unless an employee has an individual permission override configured.
            </p>
          </div>
        </div>

        {/* Feedback Alerts */}
        {(successMsg || errorMsg) && (
          <div className="px-6 pt-3">
            {successMsg && (
              <div className="rounded-md border border-success-200 bg-success-50 p-2.5 text-xs text-success-800 flex items-center gap-2">
                <Check size={14} className="shrink-0 text-success-600" />
                <span>{successMsg}</span>
              </div>
            )}
            {errorMsg && (
              <div className="rounded-md border border-danger-200 bg-danger-50 p-2.5 text-xs text-danger-800 flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0 text-danger-600" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter modules..."
            className="w-64 rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-navy-500 focus:outline-none"
          />
          <p className="text-2xs text-muted">
            {isSuperAdmin
              ? 'Click any action cell to toggle grant / revoke.'
              : 'View-only permissions preview.'}
          </p>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-line bg-surface-subtle/70 text-2xs font-semibold uppercase tracking-wider text-muted">
                  <th className="py-2.5 px-3 min-w-[140px]">Module</th>
                  {ALL_ACTIONS.map((action) => (
                    <th key={action} className="py-2.5 px-2 text-center min-w-[85px] capitalize">
                      {action}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredModules.map((module) => {
                  const actionSet = permissions[module] || new Set();
                  return (
                    <tr key={module} className="hover:bg-surface-subtle/30 transition-colors">
                      <td className="py-2 px-3 font-medium text-ink capitalize">
                        {module.replace('-', ' ')}
                      </td>
                      {ALL_ACTIONS.map((action) => {
                        const isGranted = actionSet.has(action);
                        return (
                          <td key={action} className="py-1.5 px-2 text-center">
                            <button
                              type="button"
                              disabled={!isSuperAdmin || saving}
                              onClick={() => toggleAction(module, action)}
                              title={
                                !isSuperAdmin
                                  ? isGranted ? 'Granted' : 'Not Granted'
                                  : isGranted ? 'Click to Revoke' : 'Click to Grant'
                              }
                              className={`w-full py-1 px-1.5 rounded text-2xs font-medium border transition-all inline-flex items-center justify-center gap-1 ${
                                isGranted
                                  ? 'bg-navy-50 border-navy-300 text-navy-800 font-semibold'
                                  : 'bg-surface border-transparent text-muted/50 hover:border-line'
                              } ${isSuperAdmin ? 'cursor-pointer hover:shadow-xs' : 'cursor-default'}`}
                            >
                              {isGranted ? (
                                <>
                                  <Check size={11} className="text-navy-600" />
                                  <span>Allowed</span>
                                </>
                              ) : (
                                <span>—</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line px-6 py-3 bg-surface-subtle/50">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          {isSuperAdmin && (
            <Button
              variant="accent"
              size="sm"
              leftIcon={Save}
              disabled={!hasChanges || saving}
              loading={saving}
              onClick={handleSave}
            >
              Save Role Permissions
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

