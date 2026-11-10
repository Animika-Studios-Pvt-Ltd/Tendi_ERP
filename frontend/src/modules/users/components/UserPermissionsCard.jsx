import { AlertCircle, Check, Info, Minus, Plus, RefreshCw, RotateCcw, Save, Shield } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { usersService } from '@/services/users.service';

const ALL_MODULES = Object.values(MODULES);
const ALL_ACTIONS = Object.values(ACTIONS);

export default function UserPermissionsCard({ user, rolePermissions = {}, canEditOverrides = false, onUpdated }) {
  const [overrides, setOverrides] = useState([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Sync state when user prop changes
  useEffect(() => {
    if (user?.permissionOverrides) {
      setOverrides(user.permissionOverrides.map((o) => ({ ...o })));
    } else {
      setOverrides([]);
    }
    setSuccessMsg(null);
    setErrorMsg(null);
  }, [user]);

  // Map role permissions to { [module]: Set(actions) }
  const roleMap = useMemo(() => {
    const map = {};
    for (const mod of ALL_MODULES) {
      map[mod] = new Set();
    }
    if (Array.isArray(rolePermissions)) {
      for (const grant of rolePermissions) {
        if (map[grant.module]) {
          for (const a of grant.actions || []) map[grant.module].add(a);
        }
      }
    } else if (rolePermissions && typeof rolePermissions === 'object') {
      for (const [mod, acts] of Object.entries(rolePermissions)) {
        if (map[mod] && Array.isArray(acts)) {
          for (const a of acts) map[mod].add(a);
        }
      }
    }
    return map;
  }, [rolePermissions]);

  // Lookup map for fast override query: "module:action" -> boolean (granted)
  const overrideMap = useMemo(() => {
    const map = new Map();
    for (const o of overrides) {
      map.set(`${o.module}:${o.action}`, o.granted);
    }
    return map;
  }, [overrides]);

  // Detect unsaved changes
  const hasChanges = useMemo(() => {
    const originalMap = new Map();
    for (const o of user?.permissionOverrides || []) {
      originalMap.set(`${o.module}:${o.action}`, o.granted);
    }
    if (originalMap.size !== overrideMap.size) return true;
    for (const [k, v] of overrideMap.entries()) {
      if (originalMap.get(k) !== v) return true;
    }
    return false;
  }, [user, overrideMap]);

  // Count stats
  const stats = useMemo(() => {
    let grantedCount = 0;
    let deniedCount = 0;
    for (const o of overrides) {
      if (o.granted) grantedCount++;
      else deniedCount++;
    }
    return { grantedCount, deniedCount, totalOverrides: overrides.length };
  }, [overrides]);

  // Toggle cycling: Inherited -> Granted -> Denied -> Inherited
  const cycleOverride = (module, action) => {
    if (!canEditOverrides) return;
    const key = `${module}:${action}`;
    const current = overrideMap.get(key);

    let nextOverrides = overrides.filter((o) => !(o.module === module && o.action === action));

    if (current === undefined) {
      // Was inherited -> becomes explicitly Granted
      nextOverrides.push({ module, action, granted: true });
    } else if (current === true) {
      // Was granted -> becomes explicitly Denied
      nextOverrides.push({ module, action, granted: false });
    }
    // If was false (denied) -> becomes undefined (inherited, filtered out above)

    setOverrides(nextOverrides);
    setSuccessMsg(null);
    setErrorMsg(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await usersService.setPermissions(user.id, overrides);
      setSuccessMsg('Individual permission overrides saved successfully.');
      if (onUpdated) onUpdated();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save permission overrides.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetAll = async () => {
    setSaving(true);
    setResetConfirmOpen(false);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await usersService.setPermissions(user.id, []);
      setOverrides([]);
      setSuccessMsg('All overrides reset. Employee is now using default role permissions.');
      if (onUpdated) onUpdated();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to reset permission overrides.');
    } finally {
      setSaving(false);
    }
  };

  const filteredModules = useMemo(() => {
    if (!search.trim()) return ALL_MODULES;
    const q = search.toLowerCase();
    return ALL_MODULES.filter((m) => m.toLowerCase().includes(q));
  }, [search]);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-ink">
              <Shield size={18} className="text-navy-600" />
              <span>Permission Architecture & Overrides</span>
            </div>
            <div className="flex items-center gap-2">
              {stats.grantedCount > 0 && (
                <Badge tone="success" className="gap-1 text-2xs">
                  <Plus size={10} /> {stats.grantedCount} Granted
                </Badge>
              )}
              {stats.deniedCount > 0 && (
                <Badge tone="danger" className="gap-1 text-2xs">
                  <Minus size={10} /> {stats.deniedCount} Denied
                </Badge>
              )}
              {stats.totalOverrides === 0 && (
                <Badge tone="neutral" className="text-2xs">
                  Pure Role Defaults
                </Badge>
              )}
            </div>
          </div>
        }
        description="Role-based permissions are primary. When an employee is created, they inherit all role permissions. Super Admins can optionally grant or restrict individual permissions as an exception."
      />

      <CardBody className="space-y-4">
        {/* Info Banner */}
        <div className="rounded-lg border border-line bg-surface-subtle p-3 text-xs text-muted flex items-start gap-2.5">
          <Info size={16} className="mt-0.5 shrink-0 text-navy-600" />
          <div className="space-y-1">
            <p className="font-semibold text-ink">Role-First Permission Rules</p>
            <p>
              By default, all actions inherit from the assigned role <strong>{user?.role?.name}</strong>. An individual override
              takes precedence for that specific action. Click any cell below to toggle:
              <span className="ml-1 inline-flex items-center gap-1 font-medium text-ink">
                Inherit (Role Default) &rarr; <span className="text-success-700">Grant</span> &rarr;{' '}
                <span className="text-danger-700">Deny</span>
              </span>
            </p>
          </div>
        </div>

        {/* Feedback Alerts */}
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

        {/* Toolbar: Search & Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter modules..."
            className="w-full sm:w-64 rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-navy-500 focus:outline-none"
          />

          {canEditOverrides && (
            <div className="flex items-center gap-2 shrink-0">
              {stats.totalOverrides > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={RotateCcw}
                  onClick={() => setResetConfirmOpen(true)}
                  disabled={saving}
                >
                  Reset all to role defaults
                </Button>
              )}
              <Button
                variant="accent"
                size="sm"
                leftIcon={saving ? RefreshCw : Save}
                onClick={handleSave}
                disabled={!hasChanges || saving}
                loading={saving}
              >
                {hasChanges ? 'Save overrides' : 'Saved'}
              </Button>
            </div>
          )}
        </div>

        {/* Permission Grid Table */}
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
                const roleHas = roleMap[module] || new Set();
                return (
                  <tr key={module} className="hover:bg-surface-subtle/30 transition-colors">
                    <td className="py-2 px-3 font-medium text-ink capitalize">
                      {module.replace('-', ' ')}
                    </td>
                    {ALL_ACTIONS.map((action) => {
                      const isRoleGranted = roleHas.has(action);
                      const override = overrideMap.get(`${module}:${action}`);
                      const isOverridden = override !== undefined;
                      const isGrantedOverride = override === true;
                      const isDeniedOverride = override === false;

                      // Effective permission
                      const effective = isOverridden ? override : isRoleGranted;

                      return (
                        <td key={action} className="py-1.5 px-2 text-center">
                          <button
                            type="button"
                            disabled={!canEditOverrides || saving}
                            onClick={() => cycleOverride(module, action)}
                            title={
                              !canEditOverrides
                                ? `Effective: ${effective ? 'Allowed' : 'Denied'}`
                                : isOverridden
                                ? isGrantedOverride
                                  ? 'Explicitly Granted (Click to switch to Denied)'
                                  : 'Explicitly Denied (Click to revert to Role Default)'
                                : `Inherited from Role: ${isRoleGranted ? 'Allowed' : 'Denied'} (Click to Grant Override)`
                            }
                            className={`w-full py-1 px-1.5 rounded text-2xs font-medium border transition-all inline-flex items-center justify-center gap-1 ${
                              isOverridden
                                ? isGrantedOverride
                                  ? 'bg-success-50 border-success-300 text-success-800 font-semibold shadow-xs'
                                  : 'bg-danger-50 border-danger-300 text-danger-800 font-semibold shadow-xs'
                                : isRoleGranted
                                ? 'bg-surface-subtle border-line text-ink hover:border-navy-400'
                                : 'bg-surface border-transparent text-muted/60 hover:border-line'
                            } ${canEditOverrides ? 'cursor-pointer hover:shadow-xs' : 'cursor-default'}`}
                          >
                            {isOverridden ? (
                              isGrantedOverride ? (
                                <>
                                  <Plus size={10} className="stroke-[3]" />
                                  <span>Granted</span>
                                </>
                              ) : (
                                <>
                                  <Minus size={10} className="stroke-[3]" />
                                  <span>Denied</span>
                                </>
                              )
                            ) : isRoleGranted ? (
                              <>
                                <Check size={11} className="text-muted" />
                                <span>Role Default</span>
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
      </CardBody>

      <ConfirmDialog
        isOpen={resetConfirmOpen}
        title="Reset All Permission Overrides"
        description={
          <div>
            <p>
              Are you sure you want to remove all individual permission overrides for{' '}
              <strong className="text-ink">{user?.fullName}</strong>?
            </p>
            <p className="mt-2 text-xs text-muted">
              This will restore all permissions to the defaults defined by the assigned role (
              <strong>{user?.role?.name}</strong>).
            </p>
          </div>
        }
        confirmText="Reset to Role Defaults"
        confirmVariant="danger"
        loading={saving}
        onConfirm={handleResetAll}
        onClose={() => !saving && setResetConfirmOpen(false)}
      />
    </Card>
  );
}

