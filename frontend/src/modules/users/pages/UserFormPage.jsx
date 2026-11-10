import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import FormAlert from '@/components/forms/FormAlert';
import FormField from '@/components/forms/FormField';
import PasswordInput from '@/components/forms/PasswordInput';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useAuth } from '@/hooks/useAuth';
import { rolesService } from '@/services/roles.service';
import { usersService } from '@/services/users.service';
import { applyServerErrors, emailField, passwordField } from '@/utils/validation';

const createSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().max(60).optional(),
  email: emailField,
  password: passwordField,
  phone: z.string().trim().max(20).optional(),
  designation: z.string().trim().max(80).optional(),
  role: z.string().min(1, 'Please select a role'),
  status: z.enum(['active', 'inactive', 'suspended']).default('active'),
});

const editSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().max(60).optional(),
  email: emailField,
  password: z.string().optional().refine((p) => !p || p.length >= 8, {
    message: 'Password must be at least 8 characters long',
  }),
  phone: z.string().trim().max(20).optional(),
  designation: z.string().trim().max(80).optional(),
  role: z.string().min(1, 'Please select a role'),
  status: z.enum(['active', 'inactive', 'suspended']),
});

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
];

export default function UserFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [roles, setRoles] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingUser, setLoadingUser] = useState(isEdit);
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      phone: '',
      designation: '',
      role: '',
      status: 'active',
    },
  });

  useEffect(() => {
    rolesService
      .list({ isActive: true })
      .then(({ data }) => setRoles(data ?? []))
      .catch((err) => setFormError(`Could not load roles: ${err.message}`))
      .finally(() => setLoadingRoles(false));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    setLoadingUser(true);
    usersService
      .get(id)
      .then(({ data }) => {
        reset({
          firstName: data.firstName,
          lastName: data.lastName ?? '',
          email: data.email,
          password: '',
          phone: data.phone ?? '',
          designation: data.designation ?? '',
          role: data.role?.id ?? data.role?.key ?? '',
          status: data.status,
        });
      })
      .catch((err) => {
        setFormError(`Could not load user: ${err.message}`);
      })
      .finally(() => setLoadingUser(false));
  }, [id, isEdit, reset]);

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      if (isEdit) {
        const payload = { ...values };
        if (!payload.password) delete payload.password;
        await usersService.update(id, payload);
        navigate(`/users/${id}`, { replace: true });
      } else {
        const res = await usersService.create(values);
        navigate(`/users/${res.data?.id ?? ''}`, { replace: true });
      }
    } catch (err) {
      if (!applyServerErrors(err, setError)) {
        setFormError(err.message || 'Failed to save user');
      }
    }
  };

  if (loadingRoles || loadingUser) {
    return <PageLoader label={isEdit ? 'Loading user details...' : 'Preparing user form...'} />;
  }

  const isActorSuperAdmin = currentUser?.role?.key === 'super_admin';
  const roleOptions = [
    { value: '', label: 'Select a role' },
    ...roles
      .filter((r) => r.key !== 'super_admin' || isActorSuperAdmin)
      .map((r) => ({
        value: r.id,
        label: `${r.name}${r.key === 'super_admin' ? ' (Super Admin)' : ''}`,
      })),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          to={isEdit ? `/users/${id}` : '/users'}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"
        >
          <ArrowLeft size={16} /> {isEdit ? 'Back to user profile' : 'Back to users'}
        </Link>
        <PageHeader
          title={isEdit ? 'Edit User' : 'Add New User'}
          description={
            isEdit
              ? 'Update account profile, role assignment and system access status.'
              : 'Create a new user account with role permissions and initial credentials.'
          }
        />
      </div>

      <Card as="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardHeader
          title="Account Information"
          description="Basic details and identity for the user."
        />
        <CardBody className="space-y-5">
          {formError && <FormAlert tone="danger">{formError}</FormAlert>}

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="First name" required error={errors.firstName?.message}>
              <Input
                autoComplete="given-name"
                placeholder="e.g. Ramesh"
                autoFocus={!isEdit}
                {...register('firstName')}
              />
            </FormField>

            <FormField label="Last name" error={errors.lastName?.message}>
              <Input
                autoComplete="family-name"
                placeholder="e.g. Patel"
                {...register('lastName')}
              />
            </FormField>

            <FormField label="Work email" required error={errors.email?.message}>
              <Input
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                {...register('email')}
              />
            </FormField>

            <FormField label="Phone" error={errors.phone?.message}>
              <Input
                type="tel"
                autoComplete="tel"
                placeholder="+91 98765 43210"
                {...register('phone')}
              />
            </FormField>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Designation / Title" error={errors.designation?.message}>
              <Input
                placeholder="e.g. Senior Site Engineer"
                {...register('designation')}
              />
            </FormField>

            <FormField label="Account Status" required error={errors.status?.message}>
              <Select options={STATUS_OPTIONS} {...register('status')} />
            </FormField>
          </div>

          <div className="border-t border-line pt-5">
            <h4 className="text-sm font-semibold text-ink flex items-center gap-2">
              <ShieldCheck size={16} className="text-navy-600" /> Role & Permissions
            </h4>
            <p className="mt-1 text-xs text-muted">
              Select the system role that governs module and record access for this user.
            </p>

            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <FormField label="Assigned Role" required error={errors.role?.message}>
                <Select options={roleOptions} {...register('role')} />
              </FormField>

              <FormField
                label={isEdit ? 'Reset Password (optional)' : 'Initial Password'}
                required={!isEdit}
                error={errors.password?.message}
                hint={isEdit ? 'Leave blank to keep existing password' : 'Min. 8 characters'}
              >
                <PasswordInput
                  autoComplete="new-password"
                  placeholder={isEdit ? '••••••••' : 'Enter initial password'}
                  {...register('password')}
                />
              </FormField>
            </div>
          </div>
        </CardBody>

        <CardFooter className="flex items-center justify-between border-t border-line">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(isEdit ? `/users/${id}` : '/users')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            leftIcon={Save}
            loading={isSubmitting}
            disabled={isEdit && !isDirty}
          >
            {isEdit ? 'Save Changes' : 'Create User'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

