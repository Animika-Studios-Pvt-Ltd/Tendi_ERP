import { ArrowLeft, CheckCircle, Clock, Edit2, Mail, Phone, Power, Shield, UserCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import StatusBadge from '@/components/common/StatusBadge';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { rolesService } from '@/services/roles.service';
import { usersService } from '@/services/users.service';
import { formatDateTime } from '@/utils/format';
import AssignedProjectsCard from '../components/AssignedProjectsCard';
import UserPermissionsCard from '../components/UserPermissionsCard';

export default function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, can } = useAuth();

  const [user, setUser] = useState(null);
  const [roleDetails, setRoleDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Status toggle confirmation
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [dialogError, setDialogError] = useState(null);

  const loadUserData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await usersService.get(id);
      setUser(data);
      if (data.role?.id || data.role?.key) {
        rolesService
          .get(data.role.id || data.role.key)
          .then((res) => setRoleDetails(res.data))
          .catch(() => {});
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  const handleToggleStatus = async () => {
    if (!user) return;
    setConfirmLoading(true);
    setDialogError(null);
    const nextStatus = user.status === 'active' ? 'inactive' : 'active';
    try {
      await usersService.setStatus(user.id, nextStatus);
      setConfirmOpen(false);
      loadUserData();
    } catch (err) {
      setDialogError(err.message || 'Failed to update user status');
    } finally {
      setConfirmLoading(false);
    }
  };

  if (loading) {
    return <PageLoader label="Loading user profile..." />;
  }

  if (error || !user) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <h3 className="text-lg font-semibold text-ink">User not found</h3>
        <p className="mt-2 text-sm text-muted">
          The requested user account could not be found or you do not have permission to view it.
        </p>
        <Button variant="secondary" className="mt-6" onClick={() => navigate('/users')}>
          Back to User Directory
        </Button>
      </div>
    );
  }

  const isSelf = String(currentUser?.id) === String(user.id);
  const isSuperAdmin = user.role?.key === 'super_admin';
  const actorIsSuperAdmin = currentUser?.role?.key === 'super_admin';
  const canEdit = can(MODULES.USERS, 'update') && (!isSuperAdmin || actorIsSuperAdmin);

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/users"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"
        >
          <ArrowLeft size={16} /> Back to user directory
        </Link>
        <PageHeader
          title={
            <div className="flex items-center gap-3">
              <Avatar name={user.fullName} src={user.avatarUrl} size="lg" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink">{user.fullName}</h1>
                <p className="text-sm text-muted">{user.designation || user.email}</p>
              </div>
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              {canEdit && (
                <Button
                  variant="secondary"
                  leftIcon={Edit2}
                  onClick={() => navigate(`/users/${user.id}/edit`)}
                >
                  Edit profile
                </Button>
              )}
              {canEdit && !isSelf && (
                <Button
                  variant={user.status === 'active' ? 'danger' : 'accent'}
                  leftIcon={Power}
                  onClick={() => {
                    setDialogError(null);
                    setConfirmOpen(true);
                  }}
                >
                  {user.status === 'active' ? 'Deactivate account' : 'Activate account'}
                </Button>
              )}
            </div>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Account Details */}
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Account Details" />
            <CardBody className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-medium text-muted">Email address</p>
                <div className="mt-1 flex items-center gap-2 text-ink">
                  <Mail size={15} className="text-navy-500" />
                  <span className="truncate">{user.email}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted">Phone</p>
                <div className="mt-1 flex items-center gap-2 text-ink">
                  <Phone size={15} className="text-navy-500" />
                  <span>{user.phone || 'Not provided'}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted">Status</p>
                <div className="mt-1">
                  <StatusBadge status={user.status} />
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted">Last sign in</p>
                <div className="mt-1 flex items-center gap-2 text-ink">
                  <Clock size={15} className="text-navy-500" />
                  <span>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never logged in'}</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted">Account created</p>
                <p className="mt-1 text-ink">{formatDateTime(user.createdAt)}</p>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Right Column: Role & Permissions */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title={
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-ink">
                    <Shield size={18} className="text-navy-600" />
                    <span>Role & Scope</span>
                  </div>
                  <Badge tone={user.role?.key === 'super_admin' ? 'info' : 'neutral'}>
                    {user.role?.name ?? 'Assigned Role'}
                  </Badge>
                </div>
              }
              description={roleDetails?.description || 'System permissions and record access scope.'}
            />
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-surface-subtle p-3.5">
                  <p className="text-xs font-medium text-muted">Role identifier</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-ink">{user.role?.key ?? '—'}</p>
                </div>
                <div className="rounded-lg border border-line bg-surface-subtle p-3.5">
                  <p className="text-xs font-medium text-muted">Data access scope</p>
                  <p className="mt-1 text-sm font-semibold capitalize text-ink">
                    {user.role?.dataScope === 'all'
                      ? 'Company-wide (All Projects)'
                      : user.role?.dataScope === 'assigned'
                      ? 'Assigned Projects Only'
                      : 'Own Records (Portal User)'}
                  </p>
                </div>
              </div>

              {roleDetails?.permissions && (
                <div className="mt-4 border-t border-line pt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Module Access Grants
                  </h4>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {Array.isArray(roleDetails.permissions) ? (
                      roleDetails.permissions.map((grant) => (
                        <div
                          key={grant.module}
                          className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-xs"
                        >
                          <span className="font-medium text-ink capitalize">{grant.module.replace('-', ' ')}</span>
                          <span className="text-2xs text-muted uppercase tracking-wider">
                            {grant.actions?.join(', ')}
                          </span>
                        </div>
                      ))
                    ) : (
                      Object.entries(roleDetails.permissions).map(([mod, acts]) => (
                        <div
                          key={mod}
                          className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-xs"
                        >
                          <span className="font-medium text-ink capitalize">{mod.replace('-', ' ')}</span>
                          <span className="text-2xs text-muted uppercase tracking-wider">
                            {acts.join(', ')}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Project-Level Access Control: Assigned Projects */}
          <AssignedProjectsCard
            user={user}
            canManage={can(MODULES.PROJECTS, 'update') || can(MODULES.USERS, 'update')}
            onUpdated={loadUserData}
          />

          {/* Individual Permission Overrides */}
          <UserPermissionsCard
            user={user}
            rolePermissions={roleDetails?.permissions || user.role?.permissions}
            canEditOverrides={actorIsSuperAdmin}
            onUpdated={loadUserData}
          />
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={user.status === 'active' ? 'Deactivate User Account' : 'Activate User Account'}
        description={
          <div>
            {dialogError && (
              <div className="mb-3 rounded-md bg-danger-50 p-2.5 text-xs text-danger-700">
                {dialogError}
              </div>
            )}
            <p>
              Are you sure you want to {user.status === 'active' ? 'deactivate' : 'activate'}{' '}
              <strong className="text-ink">{user.fullName}</strong>?
            </p>
            {user.status === 'active' && (
              <p className="mt-2 text-xs text-muted">
                This will prevent the user from logging in or performing any actions in Ten.Di ERP.
              </p>
            )}
          </div>
        }
        confirmText={user.status === 'active' ? 'Deactivate' : 'Activate'}
        confirmVariant={user.status === 'active' ? 'danger' : 'primary'}
        loading={confirmLoading}
        onConfirm={handleToggleStatus}
        onClose={() => !confirmLoading && setConfirmOpen(false)}
      />
    </div>
  );
}

