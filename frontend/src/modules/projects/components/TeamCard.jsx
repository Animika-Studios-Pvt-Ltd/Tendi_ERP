import { UserMinus, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import FormAlert from '@/components/forms/FormAlert';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useProject } from '@/hooks/useProject';
import { projectsService } from '@/services/projects.service';
import UserPicker from './UserPicker';

/** Team members are the users who can see this project's data in every module. */
export default function TeamCard({ projectId, canManage }) {
  const { user } = useAuth();
  const { refreshProjects } = useProject();
  const [state, setState] = useState({ members: [], loading: true, error: null });
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data } = await projectsService.team(projectId);
      setState({ members: data, loading: false, error: null });
    } catch (error) {
      setState({ members: [], loading: false, error });
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (personId, action, success) => {
    setBusyId(personId);
    setNotice(null);
    try {
      await action();
      setNotice({ tone: 'success', message: success });
      await load();
      if (personId === user?.id) refreshProjects();
    } catch (error) {
      setNotice({ tone: 'danger', message: error.message });
    } finally {
      setBusyId(null);
    }
  };

  const add = (person) => run(person.id, () => projectsService.addMember(projectId, person.id), `${person.fullName} added to the team`);
  const remove = (person) => run(person.id, () => projectsService.removeMember(projectId, person.id), `${person.fullName} removed from the team`);

  return (
    <Card className="h-fit">
      <CardHeader title="Team" icon={Users} description="Members can see this project's records in every module." />
      <CardBody className="space-y-4">
        {notice && <FormAlert tone={notice.tone}>{notice.message}</FormAlert>}
        {canManage && <UserPicker onSelect={add} excludeIds={state.members.map((m) => m.id)} placeholder="Add a person to the team" aria-label="Add team member" />}

        {state.error && <ErrorState error={state.error} onRetry={load} className="py-6" />}
        {!state.error && state.loading && state.members.length === 0 && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        )}
        {!state.error && !state.loading && state.members.length === 0 && (
          <EmptyState compact title="No team members yet" description={canManage ? 'Search above to add people.' : undefined} />
        )}

        {state.members.length > 0 && (
          <ul className="divide-y divide-line">
            {state.members.map((member) => (
              <li key={member.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={member.fullName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-ink">
                    {member.fullName}
                    {member.isProjectManager && <Badge tone="accent">PM</Badge>}
                    {member.status !== 'active' && <Badge>Inactive</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted">{member.designation || member.role?.name || member.email}</p>
                </div>
                {canManage && !member.isProjectManager && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${member.fullName} from the team`}
                    loading={busyId === member.id}
                    onClick={() => remove(member)}
                  >
                    <UserMinus size={14} />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
