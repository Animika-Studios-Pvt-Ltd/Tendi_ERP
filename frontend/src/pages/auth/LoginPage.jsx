import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import FormAlert from '@/components/forms/FormAlert';
import FormField from '@/components/forms/FormField';
import PasswordInput from '@/components/forms/PasswordInput';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { emailField } from '@/utils/validation';

const schema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password'),
});

export default function LoginPage() {
  const { login, sessionError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      await login(values);
      navigate(location.state?.from ?? '/dashboard', { replace: true });
    } catch (error) {
      setFormError(error.message);
    }
  };

  return (
    <>
      <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
      <p className="mt-1.5 text-sm text-muted">Use the work email your administrator registered for you.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-5">
        {location.state?.passwordReset && !formError && (
          <FormAlert tone="success">Password updated. Sign in with your new password.</FormAlert>
        )}
        <FormAlert>{formError ?? sessionError?.message}</FormAlert>

        <FormField label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="username" leftIcon={Mail} placeholder="name@company.com" autoFocus {...register('email')} />
        </FormField>

        <FormField
          label="Password"
          error={errors.password?.message}
          labelAction={
            <Link to="/forgot-password" className="text-xs font-medium text-navy-700 underline-offset-4 hover:underline">
              Forgot password?
            </Link>
          }
        >
          <PasswordInput autoComplete="current-password" {...register('password')} />
        </FormField>

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Sign in
        </Button>
      </form>

      <p className="mt-8 text-xs leading-relaxed text-muted">
        Accounts are created by your Company Admin. Contractors and customers receive portal access from their Ten.Di project contact.
      </p>
    </>
  );
}
