import { FlaskConical } from 'lucide-react';

/** Required on any screen that renders sample data instead of live API data. */
export default function DemoDataNotice({ children }) {
  return (
    <div
      role="note"
      className="mb-6 flex items-start gap-3 rounded-lg border border-dashed border-accent-500/70 bg-accent-50 px-4 py-3 text-sm text-navy-800"
    >
      <FlaskConical size={16} className="mt-0.5 shrink-0 text-accent-700" aria-hidden="true" />
      <p>
        <span className="font-semibold text-navy-900">Demo data.</span>{' '}
        {children ?? 'The figures on this screen are sample values for layout review and will be replaced by live data as each module is connected.'}
      </p>
    </div>
  );
}
