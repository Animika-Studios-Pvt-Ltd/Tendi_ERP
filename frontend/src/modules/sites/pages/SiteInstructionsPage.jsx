import { CheckCircle2, MessageSquareWarning, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import StatusBadge from '@/components/common/StatusBadge';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useWorkingProjectFilter } from '@/hooks/useWorkingProjectFilter';
import { erpService } from '@/services/erp.service';
import { projectsService } from '@/services/projects.service';
import { sitesService } from '@/services/sites.service';
import { formatDate } from '@/utils/format';

export default function SiteInstructionsPage() {
  const { can } = useAuth();
  const canCreate = can(MODULES.SITES, ACTIONS.CREATE);
  const canUpdate = can(MODULES.SITES, ACTIONS.UPDATE);
  const [selectedProjectId] = useWorkingProjectFilter();

  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ project: '', site: '', subject: '', instruction: '', category: 'general', priority: 'medium', issuedToName: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await erpService.sitesExtra.listInstructions(selectedProjectId ? { project: selectedProjectId } : {});
      setItems(data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    projectsService.list({ limit: 100 }).then(({ data }) => setProjects(data || [])).catch(() => {});
    sitesService.listSites({ limit: 100 }).then(({ data }) => setSites(data || [])).catch(() => {});
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    const project = form.project || selectedProjectId;
    await erpService.sitesExtra.createInstruction({ ...form, project });
    setModalOpen(false);
    load();
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Site Instructions (SI)"
        description="Formal field instructions issued to site engineers and contractors with compliance tracking."
        actions={
          canCreate && (
            <Button size="sm" leftIcon={Plus} onClick={() => setModalOpen(true)}>
              Issue Instruction
            </Button>
          )
        }
      />

      <div className="grid gap-3 md:grid-cols-2">
        {items.length === 0 ? (
          <Card className="md:col-span-2">
            <CardBody className="py-8 text-center text-xs text-muted">No site instructions issued yet.</CardBody>
          </Card>
        ) : (
          items.map((si) => (
            <Card key={si.id}>
              <CardHeader
                title={`${si.siNumber} · ${si.subject}`}
                description={`${si.project?.code || ''} · ${si.site?.name || ''} · ${formatDate(si.createdAt)}`}
                icon={MessageSquareWarning}
                actions={<StatusBadge status={si.status} />}
              />
              <CardBody className="space-y-2 text-xs">
                <p className="text-ink">{si.instruction}</p>
                <div className="flex items-center justify-between pt-2">
                  <Badge tone="neutral">{si.category} · {si.priority}</Badge>
                  {canUpdate && si.status !== 'closed' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={CheckCircle2}
                      onClick={async () => {
                        await erpService.sitesExtra.updateInstruction(si.id, { status: si.status === 'open' ? 'complied' : 'closed' });
                        load();
                      }}
                    >
                      Mark {si.status === 'open' ? 'Complied' : 'Closed'}
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg">
            <form onSubmit={handleSave}>
              <CardHeader title="Issue Site Instruction" />
              <CardBody className="space-y-3">
                <Select required value={form.project || selectedProjectId} onChange={(e) => setForm({ ...form, project: e.target.value })} placeholder="Select Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Select required value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} placeholder="Select Site *" options={sites.filter((s) => !(form.project || selectedProjectId) || s.project?.id === (form.project || selectedProjectId)).map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` }))} />
                <Input required placeholder="Subject *" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} options={['general', 'quality', 'safety', 'progress', 'rework'].map((c) => ({ value: c, label: c }))} />
                  <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} options={['low', 'medium', 'high', 'critical'].map((p) => ({ value: p, label: p }))} />
                </div>
                <Textarea required rows={3} placeholder="Detailed site instruction *" value={form.instruction} onChange={(e) => setForm({ ...form, instruction: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button type="submit">Issue SI</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

