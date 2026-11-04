import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import PageHeader from '@/components/common/PageHeader';
import FormAlert from '@/components/forms/FormAlert';
import FormField from '@/components/forms/FormField';
import PasswordInput from '@/components/forms/PasswordInput';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { authService } from '@/services/auth.service';
import { formatDateTime } from '@/utils/format';
import { applyServerErrors, PASSWORD_HINT, passwordField } from '@/utils/validation';

const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name').max(60),
  lastName: z.string().trim().max(60),
  phone: z.string().trim().max(20).regex(/^[+\d\s()-]*$/, 'Enter a valid phone number'),
  designation: z.string().trim().max(80),
});

const passwordSchema = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: passwordField, confirmPassword: z.string() })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

function ProfileForm() {
  const { user, setUser } = useAuth();
  const [notice, setNotice] = useState(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { firstName: user.firstName, lastName: user.lastName, phone: user.phone, designation: user.designation },
  });

  const onSubmit = async (values) => {
    setNotice(null);
    try {
      const { data, message } = await authService.updateProfile(values);
      setUser(data.user);
      reset(values);
      setNotice({ tone: 'success', message });
    } catch (error) {
      if (!applyServerErrors(error, setError)) setNotice({ tone: 'danger', message: error.message });
    }
  };

  return (
    <Card as="form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <CardHeader title="Personal details" description="Shown to colleagues on approvals and activity history." />
      <CardBody className="space-y-5">
        {notice && <FormAlert tone={notice.tone}>{notice.message}</FormAlert>}
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="First name" required error={errors.firstName?.message}>
            <Input autoComplete="given-name" {...register('firstName')} />
          </FormField>
          <FormField label="Last name" error={errors.lastName?.message}>
            <Input autoComplete="family-name" {...register('lastName')} />
          </FormField>
          <FormField label="Phone" error={errors.phone?.message}>
            <Input type="tel" autoComplete="tel" placeholder="+91 98765 43210" {...register('phone')} />
          </FormField>
          <FormField label="Designation" error={errors.designation?.message}>
            <Input placeholder="e.g. Senior Site Engineer" {...register('designation')} />
          </FormField>
        </div>
        <FormField label="Work email" hint="Contact your administrator to change your sign-in email.">
          <Input value={user.email} disabled readOnly />
        </FormField>
      </CardBody>
      <CardFooter>
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
          Save changes
        </Button>
      </CardFooter>
    </Card>
  );
}

function ChangePasswordForm() {
  const [notice, setNotice] = useState(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(passwordSchema), defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } });

  const onSubmit = async ({ currentPassword, newPassword }) => {
    setNotice(null);
    try {
      const { message } = await authService.changePassword({ currentPassword, newPassword });
      reset();
      setNotice({ tone: 'success', message });
    } catch (error) {
      if (!applyServerErrors(error, setError)) setNotice({ tone: 'danger', message: error.message });
    }
  };

  return (
    <Card as="form" onSubmit={handleSubmit(onSubmit)} noValidate>
      <CardHeader title="Password" description="Changing it signs you out on other devices." />
      <CardBody className="space-y-5">
        {notice && <FormAlert tone={notice.tone}>{notice.message}</FormAlert>}
        <FormField label="Current password" error={errors.currentPassword?.message}>
          <PasswordInput autoComplete="current-password" {...register('currentPassword')} />
        </FormField>
        <FormField label="New password" hint={PASSWORD_HINT} error={errors.newPassword?.message}>
          <PasswordInput autoComplete="new-password" {...register('newPassword')} />
        </FormField>
        <FormField label="Confirm new password" error={errors.confirmPassword?.message}>
          <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
        </FormField>
      </CardBody>
      <CardFooter>
        <Button type="submit" variant="secondary" loading={isSubmitting}>
          Change password
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <>
      <PageHeader title="My profile" description="Manage your personal details and password." />
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardBody className="flex flex-col items-center py-8 text-center">
            <Avatar name={user.fullName} src={user.avatarUrl} size="lg" />
            <p className="mt-3 font-display text-lg font-semibold">{user.fullName}</p>
            <p className="text-sm text-muted">{user.designation || user.email}</p>
            <Badge tone="accent" className="mt-3">
              {user.role.name}
            </Badge>
            <dl className="mt-6 w-full space-y-2 border-t border-line pt-4 text-left text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Data access</dt>
                <dd className="font-medium">{user.role.dataScope === 'all' ? 'All projects' : 'Assigned projects'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Last sign-in</dt>
                <dd className="font-medium">{formatDateTime(user.lastLoginAt)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
        <div className="space-y-6">
          <ProfileForm />
          <ChangePasswordForm />
        </div>
      </div>
    </>
  );
}
