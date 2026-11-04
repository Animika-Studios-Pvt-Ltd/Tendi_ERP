import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import EmptyState from '@/components/common/EmptyState';

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      className="py-24"
      title="This page doesn't exist"
      description="The link may be out of date, or the page was moved. Use the sidebar or search to find what you need."
      action={
        <Link to="/dashboard" className="text-sm font-medium text-navy-700 underline-offset-4 hover:underline">
          Open dashboard
        </Link>
      }
    />
  );
}
