import { AlertCircle, Briefcase, Check, FolderKanban, Plus, Trash2, UserCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '@/components/common/StatusBadge';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { usersService } from '@/services/users.service';

export default function AssignedProjectsCard({ user, canManage = false, onUpdated }) {
  const [assignedProjects, setAssignedProjects] = useState([]);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState([]);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Deletion confirm state
  const [removeProject, setRemoveProject] = useState(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);

  useEffect(() => {
    if (user?.assignedProjects && Array.isArray(user.assignedProjects)) {
      setAssignedProjects(user.assignedProjects);
    } else {
      setAssignedProjects([]);
    }
  }, [user]);

  const loadAvailableProjects = async () => {
    if (!user?.id) return;
    setLoadingAvailable(true);
    setErrorMsg(null);
    try {
      const { data } = await usersService.availableProjects(user.id);
      setAvailableProjects(data ?? []);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to load available projects');
    } finally {
      setLoadingAvailable(false);
    }
  };

  const openAssignModal = () => {
    setSelectedProjectIds([]);
    setErrorMsg(null);
    setSuccessMsg(null);
    setAssignModalOpen(true);
    loadAvailableProjects();
  };

  const handleAssignProjects = async () => {
    if (!selectedProjectIds.length) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await usersService.assignProjects(user.id, selectedProjectIds);
      setSuccessMsg('Project(s) assigned successfully.');
      setAssignModalOpen(false);
      if (onUpdated) onUpdated();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to assign project(s).');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveProject = async () => {
    if (!removeProject) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await usersService.removeProject(user.id, removeProject.id);
      setSuccessMsg(`Project ${removeProject.code} removed from employee assignments.`);
      setRemoveConfirmOpen(false);
      setRemoveProject(null);
      if (onUpdated) onUpdated();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to remove project assignment.');
    } finally {
      setSaving(false);
    }
  };

  const toggleProjectSelection = (id) => {
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id],
    );
  };

  return (
    <Card>
      <CardHeader
        title={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-ink">
              <FolderKanban size={18} className="text-navy-600" />
              <span>Assigned Projects</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="info" className="text-2xs">
                {assignedProjects.length} {assignedProjects.length === 1 ? 'Project' : 'Projects'}
              </Badge>
              {canManage && (
                <Button variant="secondary" size="sm" leftIcon={Plus} onClick={openAssignModal}>
                  Assign project
                </Button>
              )}
            </div>
          </div>
        }
        description="Projects this employee is authorized to access. Records in every module are scoped to assigned projects."
      />

      <CardBody className="space-y-3">
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

        {assignedProjects.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted">
            <Briefcase size={28} className="mx-auto mb-2 text-muted/60" />
            <p className="font-semibold text-ink">No projects assigned</p>
            <p className="mt-1">
              This employee is currently not assigned to any projects. They will have access only to general dashboard views.
            </p>
            {canManage && (
              <Button variant="secondary" size="sm" className="mt-3" leftIcon={Plus} onClick={openAssignModal}>
                Assign first project
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-line rounded-lg border border-line overflow-hidden">
            {assignedProjects.map((proj) => {
              const isObj = proj && typeof proj === 'object';
              const pId = isObj ? proj.id : proj;
              const code = isObj ? proj.code : 'PRJ';
              const name = isObj ? proj.name : `Project ${proj}`;
              const status = isObj ? proj.status : 'active';
              const isPM = isObj && proj.projectManager?.id === user.id;

              return (
                <div key={pId} className="flex items-center justify-between p-3 hover:bg-surface-subtle/40 transition-colors text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link to={`/projects/${pId}`} className="font-mono font-semibold text-navy-700 hover:underline">
                        {code}
                      </Link>
                      <StatusBadge status={status} />
                      {isPM && (
                        <Badge tone="accent" className="text-2xs gap-1">
                          <UserCheck size={10} /> Designated PM
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-ink font-medium mt-0.5">{name}</p>
                  </div>

                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove assignment for ${name}`}
                      disabled={saving}
                      onClick={() => {
                        setRemoveProject({ id: pId, code, name, isPM });
                        setRemoveConfirmOpen(true);
                      }}
                      className="text-muted hover:text-danger-600"
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardBody>

      {/* Assign Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs">
          <div className="relative flex flex-col w-full max-w-lg max-h-[85vh] bg-surface rounded-xl shadow-xl border border-line">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <div className="flex items-center gap-2">
                <FolderKanban size={18} className="text-navy-600" />
                <h3 className="font-bold text-ink">Assign Projects to {user.fullName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="p-1 rounded text-muted hover:text-ink hover:bg-surface-subtle"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-3">
              <p className="text-xs text-muted">
                Select one or more active projects to grant this employee access:
              </p>

              {loadingAvailable ? (
                <div className="py-8 text-center text-xs text-muted">Loading available projects...</div>
              ) : availableProjects.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted border border-line rounded-lg">
                  All active projects are already assigned to this employee.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto border border-line rounded-lg p-2">
                  {availableProjects.map((p) => {
                    const isSelected = selectedProjectIds.includes(p.id);
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => toggleProjectSelection(p.id)}
                        className={`w-full flex items-center justify-between p-2.5 rounded text-left text-xs transition-colors border ${
                          isSelected
                            ? 'bg-navy-50/60 border-navy-400 text-ink font-medium'
                            : 'bg-surface border-transparent hover:bg-surface-subtle text-muted hover:text-ink'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-navy-700">{p.code}</span>
                            <StatusBadge status={p.status} />
                          </div>
                          <p className="text-ink text-xs mt-0.5">{p.name}</p>
                        </div>
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-navy-600 border-navy-600 text-white' : 'border-line'
                          }`}
                        >
                          {isSelected && <Check size={11} className="stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-line px-5 py-3 bg-surface-subtle/50">
              <Button variant="secondary" size="sm" onClick={() => setAssignModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="accent"
                size="sm"
                disabled={!selectedProjectIds.length || saving}
                loading={saving}
                onClick={handleAssignProjects}
              >
                Assign {selectedProjectIds.length ? `(${selectedProjectIds.length})` : ''}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation */}
      <ConfirmDialog
        isOpen={removeConfirmOpen}
        title="Remove Project Assignment"
        description={
          <div>
            <p>
              Are you sure you want to remove project{' '}
              <strong className="text-ink">{removeProject?.name} ({removeProject?.code})</strong> from{' '}
              <strong className="text-ink">{user.fullName}</strong>?
            </p>
            {removeProject?.isPM && (
              <p className="mt-2 text-xs font-semibold text-danger-700 bg-danger-50 p-2 rounded">
                Warning: This employee is designated as the Project Manager for this project. Reassign the project manager before removing.
              </p>
            )}
            <p className="mt-2 text-xs text-muted">
              Removing this assignment immediately revokes the employee's access to all records in this project.
            </p>
          </div>
        }
        confirmText="Remove Assignment"
        confirmVariant="danger"
        loading={saving}
        onConfirm={handleRemoveProject}
        onClose={() => !saving && setRemoveConfirmOpen(false)}
      />
    </Card>
  );
}

