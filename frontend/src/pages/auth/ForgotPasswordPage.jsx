import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import FormAlert from '@/components/forms/FormAlert';
import FormField from '@/components/forms/FormField';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { authService } from '@/services/auth.service';
import { emailField } from '@/utils/validation';

const schema = z.object({ email: emailField });

export default function ForgotPasswordPage() {
  const [result, setResult] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = async ({ email }) => {
    try {
      const response = await authService.forgotPassword(email);
      setResult({ tone: 'success', message: response.message });
    } catch (error) {
      setResult({ tone: 'danger', message: error.message });
    }
  };

  return (
    <>
      <Link to="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} /> Back to sign in
      </Link>
      <h2 className="text-2xl font-semibold tracking-tight">Reset your password</h2>
      <p className="mt-1.5 text-sm text-muted">Enter your work email and we&apos;ll send a link to choose a new password.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-5">
        {result && <FormAlert tone={result.tone}>{result.message}</FormAlert>}
        <FormField label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" leftIcon={Mail} placeholder="name@company.com" autoFocus {...register('email')} />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Send reset link
        </Button>
      </form>
    </>
  );
}
