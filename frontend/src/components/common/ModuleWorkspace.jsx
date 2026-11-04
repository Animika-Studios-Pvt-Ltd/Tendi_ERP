import { CalendarClock, CircleDashed } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { ACTIONS } from '@/constants/permissions';
import Badge from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import PageHeader from './PageHeader';

const ACTION_LABELS = {
  [ACTIONS.CREATE]: 'Create',
  [ACTIONS.READ]: 'View',
  [ACTIONS.UPDATE]: 'Edit',
  [ACTIONS.DELETE]: 'Delete',
  [ACTIONS.APPROVE]: 'Approve',
  [ACTIONS.REJECT]: 'Reject',
};

/**
 * Shared landing view for modules whose screens are not built yet.
 * Driven entirely by the module manifest, so no per-module placeholder pages exist.
 */
export default function ModuleWorkspace({ module, section }) {
  const { user } = useAuth();
  const granted = user?.permissions?.[module.permission] ?? [];
  const title = section?.path ? section.title : module.title;

  return (
    <>
      <PageHeader
        title={title}
        description={module.description}
        meta={
          <Badge tone="accent">
            <CalendarClock size={12} aria-hidden="true" /> Scheduled for phase {module.phase}
          </Badge>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="What this module will cover" description="Scope agreed for the module build." />
          <CardBody>
            <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {module.capabilities.map((capability) => (
                <li key={capability} className="flex items-start gap-2.5 text-sm text-ink">
                  <CircleDashed size={16} className="mt-0.5 shrink-0 text-navy-400" aria-hidden="true" />
                  {capability}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Your access" description={`As ${user?.role?.name}`} />
          <CardBody className="flex flex-wrap gap-2">
            {Object.values(ACTIONS).map((action) => (
              <Badge key={action} tone={granted.includes(action) ? 'success' : 'neutral'} className={granted.includes(action) ? '' : 'opacity-60 line-through'}>
                {ACTION_LABELS[action]}
              </Badge>
            ))}
          </CardBody>
        </Card>

        {module.workflow && (
          <Card className="xl:col-span-3">
            <CardHeader title={`${module.workflow.title} workflow`} description="Each step records who acted, when, and the resulting status." />
            <CardBody>
              <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                {module.workflow.steps.map((step, index) => (
                  <li key={step} className="flex items-start gap-3 rounded-md border border-line bg-canvas px-3 py-3">
                    <span className="tabular inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <span className="text-sm text-ink">{step}</span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
