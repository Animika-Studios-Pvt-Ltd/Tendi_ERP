import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';

export default function AccessDenied({ moduleTitle }) {
  const { user } = useAuth();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-danger-50 text-danger-600 ring-1 ring-danger-600/20">
        <ShieldAlert size={22} aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold">You don&apos;t have access to {moduleTitle ?? 'this page'}</h1>
      <p className="mt-2 text-sm text-muted">
        Your role ({user?.role?.name}) doesn&apos;t include this module. Ask a Company Admin to update your permissions if you need it.
      </p>
      <Button className="mt-6" variant="secondary" onClick={() => window.history.back()}>
        Go back
      </Button>
      <Link to="/dashboard" className="mt-3 text-sm font-medium text-navy-700 underline-offset-4 hover:underline">
        Open dashboard
      </Link>
    </div>
  );
}
