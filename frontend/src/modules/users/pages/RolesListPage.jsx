import { ArrowRight, Info, Lock, Shield, Sliders, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useAuth } from '@/hooks/useAuth';
import { rolesService } from '@/services/roles.service';
import RolePermissionsModal from '../components/RolePermissionsModal';

export default function RolesListPage() {
  const { user } = useAuth();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const isSuperAdmin = user?.role?.key === 'super_admin';

  const fetchRoles = useCallback(() => {
    rolesService
      .list()
      .then(({ data }) => setRoles(data ?? []))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  if (loading) {
    return <PageLoader label="Loading system roles..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & Access Scopes"
        description="Standard role definitions, data access levels and assigned user counts."
      />

      <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-subtle p-4 text-xs text-muted">
        <Info size={18} className="mt-0.5 shrink-0 text-navy-600" />
        <div className="space-y-1">
          <p className="font-semibold text-ink">System Role Protection</p>
          <p>
            Standard ERP roles are built-in system definitions protected against accidental deletion or modification.
            Data scope dictates record visibility (Company-wide, Assigned projects, or Own submissions).
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => (
          <Card key={role.id || role.key} className="flex flex-col justify-between">
            <div>
              <CardHeader
                title={
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Shield size={16} className="text-navy-600 shrink-0" />
                      <span className="text-base font-semibold text-ink">{role.name}</span>
                    </div>
                    {role.isSystem && (
                      <Badge tone="neutral" className="gap-1">
                        <Lock size={10} /> System
                      </Badge>
                    )}
                  </div>
                }
              />
              <CardBody className="py-2 text-xs">
                <p className="text-muted leading-relaxed">{role.description || 'No description provided.'}</p>
                <div className="mt-4 pt-3 border-t border-line space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Key identifier</span>
                    <span className="font-mono font-medium text-ink">{role.key}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Data scope</span>
                    <Badge tone={role.dataScope === 'all' ? 'info' : 'neutral'}>
                      {role.dataScope === 'all' ? 'Company-wide' : role.dataScope === 'assigned' ? 'Assigned' : 'Own'}
                    </Badge>
                  </div>
                </div>
              </CardBody>
            </div>
            <div className="border-t border-line bg-surface-subtle/50 px-4 py-3 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted">
                <Users size={14} /> Assigned users: <strong className="tabular text-ink">{role.userCount ?? 0}</strong>
              </span>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={isSuperAdmin ? Sliders : Shield}
                onClick={() => {
                  setSelectedRole(role);
                  setModalOpen(true);
                }}
              >
                {isSuperAdmin ? 'Configure' : 'View'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <RolePermissionsModal
        role={selectedRole}
        isOpen={modalOpen}
        isSuperAdmin={isSuperAdmin}
        onClose={() => {
          setModalOpen(false);
          setSelectedRole(null);
        }}
        onUpdated={fetchRoles}
      />
    </div>
  );
}

