import Spinner from '@/components/ui/Spinner';

export default function PageLoader({ label = 'Loading' }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-navy-500">
      <Spinner size={20} label={label} />
    </div>
  );
}
