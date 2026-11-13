import { Plus, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
import { formatDate } from '@/utils/format';

export default function QualitySafetyWorkspacePage({ initialTab = 'inspections' }) {
  const { can } = useAuth();
  const canCreate = can(MODULES.QUALITY_SAFETY, ACTIONS.CREATE);
  const canUpdate = can(MODULES.QUALITY_SAFETY, ACTIONS.UPDATE);
  const [selectedProjectId] = useWorkingProjectFilter();

  const [tab, setTab] = useState(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  const [inspections, setInspections] = useState([]);
  const [ncrs, setNcrs] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const [inspModal, setInspModal] = useState(false);
  const [inspForm, setInspForm] = useState({ project: '', title: '', inspectionType: 'structural', workPackage: '', checkItem: 'Alignment & concrete cover checked', checkResult: 'pass', notes: '' });
  const [ncrModal, setNcrModal] = useState(false);
  const [ncrForm, setNcrForm] = useState({ project: '', title: '', severity: 'major', description: '' });
  const [safModal, setSafModal] = useState(false);
  const [safForm, setSafForm] = useState({ project: '', incidentType: 'toolbox_talk', title: '', attendeesCount: '15' });
  const [bannerError, setBannerError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setBannerError('');
    try {
      const params = selectedProjectId ? { project: selectedProjectId } : {};
      const [q, n, s] = await Promise.all([
        erpService.qualitySafety.listInspections(params),
        erpService.qualitySafety.listNcrs(params),
        erpService.qualitySafety.listIncidents(params),
      ]);
      setInspections(q.data || []);
      setNcrs(n.data || []);
      setIncidents(s.data || []);
    } catch (err) {
      setBannerError(err?.response?.data?.message || err?.message || 'Failed to load Quality & Safety records');
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  const runAction = async (fn) => {
    setBannerError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setBannerError(err?.response?.data?.message || err?.message || 'Operation failed');
    }
  };

  useEffect(() => {
    load();
    projectsService.list({ limit: 100 }).then(({ data }) => setProjects(data || [])).catch(() => {});
  }, [load]);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Quality & Safety"
        description="Site quality inspections, NCR punch lists (linked to Project Closure gate), safety incidents, and TBTs."
        actions={
          canCreate && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setInspModal(true)}>Inspection</Button>
              <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setSafModal(true)}>Safety / TBT</Button>
              <Button size="sm" leftIcon={Plus} onClick={() => setNcrModal(true)}>Raise NCR</Button>
            </div>
          )
        }
      />

      {bannerError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{bannerError}</div>
      )}

      <div className="flex gap-1 border-b border-line pb-1">
        {[
          { key: 'inspections', label: 'Quality Inspections' },
          { key: 'ncrs', label: 'NCR & Punch List' },
          { key: 'safety', label: 'Safety & TBTs' },
        ].map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === t.key ? 'bg-navy-900 text-white' : 'text-muted hover:bg-canvas'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'inspections' && (
        <div className="space-y-2">
          {inspections.length === 0 ? (
            <Card><CardBody className="py-8 text-center text-xs text-muted">No quality inspections logged yet. Click &ldquo;+ Inspection&rdquo; to record one.</CardBody></Card>
          ) : inspections.map((i) => (
            <Card key={i.id}>
              <CardBody className="flex items-center justify-between py-3 text-xs">
                <div>
                  <p className="font-semibold text-ink">{i.inspectionNumber} · {i.title}</p>
                  <p className="text-muted">{i.project?.code} · {i.inspectionType} · {formatDate(i.inspectedAt)}</p>
                </div>
                <StatusBadge status={i.overallResult} />
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'ncrs' && (
        <div className="space-y-2">
          {ncrs.length === 0 ? (
            <Card><CardBody className="py-8 text-center text-xs text-muted">No open or historical NCRs found.</CardBody></Card>
          ) : ncrs.map((n) => (
            <Card key={n.id}>
              <CardBody className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-ink">{n.ncrNumber}</span>
                    <Badge tone={n.severity === 'critical' ? 'danger' : 'warning'}>{n.severity}</Badge>
                  </div>
                  <p className="font-medium text-ink">{n.title}</p>
                  <p className="text-muted">{n.project?.code} · {n.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={n.status} />
                  {canUpdate && n.status !== 'closed' && (
                    <Button size="sm" variant="secondary" onClick={() => runAction(() => erpService.qualitySafety.updateNcr(n.id, { status: 'closed' }))}>Close NCR</Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'safety' && (
        <div className="space-y-2">
          {incidents.length === 0 ? (
            <Card><CardBody className="py-8 text-center text-xs text-muted">No safety incidents or toolbox talks logged yet.</CardBody></Card>
          ) : incidents.map((s) => (
            <Card key={s.id}>
              <CardBody className="flex items-center justify-between py-3 text-xs">
                <div>
                  <p className="font-semibold text-ink">{s.incidentNumber} · {s.title}</p>
                  <p className="text-muted">{s.project?.code} · {s.incidentType.replaceAll('_', ' ')} · {formatDate(s.incidentDate)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={s.status} />
                  {canUpdate && s.status !== 'closed' && (
                    <Button size="sm" variant="secondary" onClick={() => runAction(() => erpService.qualitySafety.updateIncident(s.id, { status: 'closed' }))}>Close</Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {inspModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
                await erpService.qualitySafety.createInspection({
                  project: inspForm.project || selectedProjectId,
                  title: inspForm.title,
                  inspectionType: inspForm.inspectionType,
                  workPackage: inspForm.workPackage,
                  checklistItems: inspForm.checkItem.trim() ? [{ label: inspForm.checkItem.trim(), status: inspForm.checkResult }] : [],
                  notes: inspForm.notes,
                });
                setInspForm({ project: '', title: '', inspectionType: 'structural', workPackage: '', checkItem: 'Alignment & concrete cover checked', checkResult: 'pass', notes: '' });
                setInspModal(false);
              });
            }}>
              <CardHeader title="Log Quality Inspection" icon={ShieldCheck} />
              <CardBody className="space-y-3">
                <Select required value={inspForm.project || selectedProjectId} onChange={(e) => setInspForm({ ...inspForm, project: e.target.value })} placeholder="Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Input required placeholder="Inspection Title *" value={inspForm.title} onChange={(e) => setInspForm({ ...inspForm, title: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={inspForm.inspectionType} onChange={(e) => setInspForm({ ...inspForm, inspectionType: e.target.value })} options={['material', 'workmanship', 'structural', 'finishing', 'mep'].map((t) => ({ value: t, label: t }))} />
                  <Input placeholder="Work Package" value={inspForm.workPackage} onChange={(e) => setInspForm({ ...inspForm, workPackage: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input className="col-span-2" placeholder="Checklist Item" value={inspForm.checkItem} onChange={(e) => setInspForm({ ...inspForm, checkItem: e.target.value })} />
                  <Select value={inspForm.checkResult} onChange={(e) => setInspForm({ ...inspForm, checkResult: e.target.value })} options={[{ value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }, { value: 'na', label: 'N/A' }]} />
                </div>
                <Textarea rows={2} placeholder="Inspection notes" value={inspForm.notes} onChange={(e) => setInspForm({ ...inspForm, notes: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setInspModal(false)}>Cancel</Button>
                <Button type="submit">Save Inspection</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {ncrModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => { e.preventDefault(); runAction(async () => { await erpService.qualitySafety.createNcr({ ...ncrForm, project: ncrForm.project || selectedProjectId }); setNcrForm({ project: '', title: '', severity: 'major', description: '' }); setNcrModal(false); }); }}>
              <CardHeader title="Raise Non-Conformance Report (NCR)" icon={ShieldCheck} />
              <CardBody className="space-y-3">
                <Select required value={ncrForm.project || selectedProjectId} onChange={(e) => setNcrForm({ ...ncrForm, project: e.target.value })} placeholder="Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Input required placeholder="Defect / NCR Title *" value={ncrForm.title} onChange={(e) => setNcrForm({ ...ncrForm, title: e.target.value })} />
                <Select value={ncrForm.severity} onChange={(e) => setNcrForm({ ...ncrForm, severity: e.target.value })} options={['minor', 'major', 'critical'].map((s) => ({ value: s, label: s }))} />
                <Textarea rows={2} placeholder="Details" value={ncrForm.description} onChange={(e) => setNcrForm({ ...ncrForm, description: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setNcrModal(false)}>Cancel</Button>
                <Button type="submit">Raise NCR</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {safModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => { e.preventDefault(); runAction(async () => { await erpService.qualitySafety.createIncident({ ...safForm, project: safForm.project || selectedProjectId, attendeesCount: Number(safForm.attendeesCount) }); setSafForm({ project: '', incidentType: 'toolbox_talk', title: '', attendeesCount: '15' }); setSafModal(false); }); }}>
              <CardHeader title="Log Safety Observation / Incident / TBT" />
              <CardBody className="space-y-3">
                <Select required value={safForm.project || selectedProjectId} onChange={(e) => setSafForm({ ...safForm, project: e.target.value })} placeholder="Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Select value={safForm.incidentType} onChange={(e) => setSafForm({ ...safForm, incidentType: e.target.value })} options={['toolbox_talk', 'near_miss', 'first_aid', 'medical_treatment', 'lti', 'property_damage'].map((t) => ({ value: t, label: t.replaceAll('_', ' ') }))} />
                <Input required placeholder="Title *" value={safForm.title} onChange={(e) => setSafForm({ ...safForm, title: e.target.value })} />
                <Input type="number" placeholder="TBT Attendees Count" value={safForm.attendeesCount} onChange={(e) => setSafForm({ ...safForm, attendeesCount: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setSafModal(false)}>Cancel</Button>
                <Button type="submit">Log Record</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

