import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import FormAlert from '@/components/forms/FormAlert';
import FormField from '@/components/forms/FormField';
import PasswordInput from '@/components/forms/PasswordInput';
import Button from '@/components/ui/Button';
import { authService } from '@/services/auth.service';
import { PASSWORD_HINT, passwordField } from '@/utils/validation';

const schema = z
  .object({ password: passwordField, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { password: '', confirmPassword: '' } });

  if (!token) {
    return (
      <>
        <h2 className="text-2xl font-semibold tracking-tight">This reset link is incomplete</h2>
        <p className="mt-2 text-sm text-muted">Open the link from your email again, or request a new one.</p>
        <Link to="/forgot-password" className="mt-6 inline-block text-sm font-medium text-navy-700 underline-offset-4 hover:underline">
          Request a new link
        </Link>
      </>
    );
  }

  const onSubmit = async ({ password }) => {
    setFormError(null);
    try {
      await authService.resetPassword({ token, password });
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch (error) {
      setFormError(error.message);
    }
  };

  return (
    <>
      <h2 className="text-2xl font-semibold tracking-tight">Choose a new password</h2>
      <p className="mt-1.5 text-sm text-muted">After saving, sign in again on every device.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-5">
        <FormAlert>{formError}</FormAlert>
        <FormField label="New password" hint={PASSWORD_HINT} error={errors.password?.message}>
          <PasswordInput autoComplete="new-password" autoFocus {...register('password')} />
        </FormField>
        <FormField label="Confirm new password" error={errors.confirmPassword?.message}>
          <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Save new password
        </Button>
      </form>
    </>
  );
}
