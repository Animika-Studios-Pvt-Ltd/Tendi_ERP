import { CheckCircle2, Edit2, Eye, Plus, Power, ShieldAlert, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import DataTable from '@/components/tables/DataTable';
import TableToolbar from '@/components/tables/TableToolbar';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Select from '@/components/ui/Select';
import { MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { rolesService } from '@/services/roles.service';
import { usersService } from '@/services/users.service';
import { formatDateTime } from '@/utils/format';

const PAGE_SIZE = 20;

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
];

export default function UsersListPage() {
  const navigate = useNavigate();
  const { user: currentUser, can } = useAuth();

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  // Status change dialog state
  const [targetUser, setTargetUser] = useState(null);
  const [actionStatus, setActionStatus] = useState(null);
  const [statusDialogLoading, setStatusDialogLoading] = useState(false);
  const [statusDialogError, setStatusDialogError] = useState(null);

  // Load available roles for the filter
  useEffect(() => {
    rolesService
      .list()
      .then(({ data }) => setRoles(data ?? []))
      .catch(() => {});
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await usersService.list({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      });
      setUsers(response.data ?? []);
      setMeta(response.meta);
    } catch (err) {
      setError(err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, roleFilter, statusFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter, statusFilter]);

  const handleStatusToggle = (user, nextStatus) => {
    setTargetUser(user);
    setActionStatus(nextStatus);
    setStatusDialogError(null);
  };

  const confirmStatusChange = async () => {
    if (!targetUser || !actionStatus) return;
    setStatusDialogLoading(true);
    setStatusDialogError(null);
    try {
      await usersService.setStatus(targetUser.id, actionStatus);
      setTargetUser(null);
      setActionStatus(null);
      loadUsers();
    } catch (err) {
      setStatusDialogError(err.message || 'Failed to update user status');
    } finally {
      setStatusDialogLoading(false);
    }
  };

  const roleFilterOptions = [
    { value: '', label: 'All roles' },
    ...roles.map((r) => ({ value: r.key, label: r.name })),
  ];

  const columns = [
    {
      key: 'name',
      header: 'User',
      render: (u) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={u.fullName} src={u.avatarUrl} size="sm" />
          <div className="min-w-0">
            <Link
              to={`/users/${u.id}`}
              className="block truncate font-medium text-ink hover:text-navy-900 hover:underline"
            >
              {u.fullName}
            </Link>
            <p className="truncate text-xs text-muted">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <Badge tone={u.role?.key === 'super_admin' ? 'info' : 'neutral'}>
          {u.role?.name ?? '—'}
        </Badge>
      ),
    },
    {
      key: 'designation',
      header: 'Designation',
      render: (u) => <span className="text-sm text-subtle">{u.designation || '—'}</span>,
    },
    {
      key: 'phone',
      header: 'Phone',
      className: 'tabular text-sm',
      render: (u) => u.phone || '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => <StatusBadge status={u.status} />,
    },
    {
      key: 'lastLoginAt',
      header: 'Last sign in',
      className: 'tabular whitespace-nowrap text-xs text-muted',
      render: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (u) => {
        const isSelf = String(currentUser?.id) === String(u.id);
        const isSuperAdmin = u.role?.key === 'super_admin';
        const actorIsSuperAdmin = currentUser?.role?.key === 'super_admin';
        const canEditUser = can(MODULES.USERS, 'update') && (!isSuperAdmin || actorIsSuperAdmin);

        return (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon-sm"
              title="View details"
              aria-label="View details"
              onClick={() => navigate(`/users/${u.id}`)}
            >
              <Eye size={15} />
            </Button>
            {canEditUser && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Edit user"
                aria-label="Edit user"
                onClick={() => navigate(`/users/${u.id}/edit`)}
              >
                <Edit2 size={15} />
              </Button>
            )}
            {canEditUser && !isSelf && (
              u.status === 'active' ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-danger-600 hover:text-danger-700 hover:bg-danger-50"
                  title="Deactivate user"
                  aria-label="Deactivate user"
                  onClick={() => handleStatusToggle(u, 'inactive')}
                >
                  <Power size={15} />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-success-600 hover:text-success-700 hover:bg-success-50"
                  title="Activate user"
                  aria-label="Activate user"
                  onClick={() => handleStatusToggle(u, 'active')}
                >
                  <CheckCircle2 size={15} />
                </Button>
              )
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="User & Access Management"
        description="Manage company users, system roles and authentication access."
        actions={
          can(MODULES.USERS, 'create') && (
            <Button
              variant="primary"
              leftIcon={UserPlus}
              onClick={() => navigate('/users/new')}
            >
              Add user
            </Button>
          )
        }
      />

      <Card>
        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search users by name or email..."
        >
          <div className="flex items-center gap-2">
            <Select
              size="sm"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              options={roleFilterOptions}
              className="w-44"
            />
            <Select
              size="sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={STATUS_FILTER_OPTIONS}
              className="w-36"
            />
          </div>
        </TableToolbar>

        <DataTable
          columns={columns}
          data={users}
          loading={loading}
          error={error}
          onRetry={loadUsers}
          emptyTitle="No users found"
          emptyDescription={
            search || roleFilter || statusFilter
              ? 'Try adjusting your search query or filters.'
              : 'Add your first company user to grant access to Ten.Di ERP.'
          }
          emptyAction={
            can(MODULES.USERS, 'create') && !search && !roleFilter && !statusFilter ? (
              <Button leftIcon={Plus} onClick={() => navigate('/users/new')}>
                Add user
              </Button>
            ) : null
          }
          pagination={
            meta
              ? {
                  page: meta.page,
                  limit: meta.limit,
                  total: meta.total,
                  onPageChange: setPage,
                }
              : null
          }
          onRowClick={(u) => navigate(`/users/${u.id}`)}
        />
      </Card>

      <ConfirmDialog
        isOpen={Boolean(targetUser && actionStatus)}
        title={actionStatus === 'active' ? 'Activate User Account' : 'Deactivate User Account'}
        description={
          <div>
            {statusDialogError && (
              <div className="mb-3 rounded-md bg-danger-50 p-2.5 text-xs text-danger-700">
                {statusDialogError}
              </div>
            )}
            <p>
              Are you sure you want to {actionStatus === 'active' ? 'activate' : 'deactivate'}{' '}
              <strong className="text-ink">{targetUser?.fullName}</strong> ({targetUser?.email})?
            </p>
            {actionStatus === 'inactive' && (
              <p className="mt-2 text-xs text-muted">
                The user will be immediately blocked from signing in until their account is reactivated.
              </p>
            )}
          </div>
        }
        confirmText={actionStatus === 'active' ? 'Activate' : 'Deactivate'}
        confirmVariant={actionStatus === 'active' ? 'primary' : 'danger'}
        loading={statusDialogLoading}
        onConfirm={confirmStatusChange}
        onClose={() => {
          if (!statusDialogLoading) {
            setTargetUser(null);
            setActionStatus(null);
            setStatusDialogError(null);
          }
        }}
      />
    </>
  );
}

