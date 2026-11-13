import { HeartHandshake, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import StatusBadge from '@/components/common/StatusBadge';
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
import { formatCurrencyCompact, formatDate } from '@/utils/format';

export default function CrmWorkspacePage({ initialTab = 'customers' }) {
  const { can } = useAuth();
  const canCreate = can(MODULES.CRM, ACTIONS.CREATE);
  const canUpdate = can(MODULES.CRM, ACTIONS.UPDATE);
  const [selectedProjectId] = useWorkingProjectFilter();
  const [tab, setTab] = useState(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  const [clients, setClients] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [handovers, setHandovers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bannerError, setBannerError] = useState('');

  const [cliModal, setCliModal] = useState(false);
  const [cliForm, setCliForm] = useState({ name: '', contactPerson: '', phone: '', city: '' });
  const [enqModal, setEnqModal] = useState(false);
  const [enqForm, setEnqForm] = useState({ clientName: '', title: '', estimatedValue: '0', stage: 'new' });
  const [cmpModal, setCmpModal] = useState(false);
  const [cmpForm, setCmpForm] = useState({ project: '', client: '', subject: '', priority: 'medium', description: '' });
  const [hoModal, setHoModal] = useState(false);
  const [hoForm, setHoForm] = useState({ project: '', client: '', warrantyMonths: '12', snagsCleared: true, certificatesIssued: true, notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setBannerError('');
    try {
      const [c, e, cmp, ho] = await Promise.all([
        erpService.crm.listClients(),
        erpService.crm.listEnquiries(),
        erpService.crm.listComplaints(),
        erpService.crm.listHandovers(),
      ]);
      setClients(c.data || []);
      setEnquiries(e.data || []);
      setComplaints(cmp.data || []);
      setHandovers(ho.data || []);
    } catch (err) {
      setBannerError(err?.response?.data?.message || err?.message || 'Failed to load CRM records');
    } finally {
      setLoading(false);
    }
  }, []);

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
        title="CRM & Client Portal"
        description="Client accounts, project enquiries pipeline, complaints, handover certificates and warranty tracking."
        actions={
          canCreate && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setCmpModal(true)}>Log Complaint</Button>
              <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setHoModal(true)}>Handover</Button>
              <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setCliModal(true)}>New Client</Button>
              <Button size="sm" leftIcon={Plus} onClick={() => setEnqModal(true)}>New Enquiry</Button>
            </div>
          )
        }
      />

      {bannerError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{bannerError}</div>
      )}

      <div className="flex gap-1 border-b border-line pb-1">
        {[{ key: 'customers', label: 'Clients' }, { key: 'enquiries', label: 'Enquiry Pipeline' }, { key: 'handover', label: 'Handover & Complaints' }].map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === t.key ? 'bg-navy-900 text-white' : 'text-muted hover:bg-canvas'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'customers' && (
        <div className="grid gap-3 md:grid-cols-3">
          {clients.length === 0 ? (
            <Card className="md:col-span-3"><CardBody className="py-8 text-center text-xs text-muted">No clients added yet.</CardBody></Card>
          ) : clients.map((c) => (
            <Card key={c.id}>
              <CardBody className="space-y-1 text-xs">
                <p className="font-mono font-semibold">{c.code}</p>
                <p className="text-sm font-medium text-ink">{c.name}</p>
                <p className="text-muted">{c.contactPerson || '—'} · {c.city || '—'}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'enquiries' && (
        <div className="space-y-2">
          {enquiries.length === 0 ? (
            <Card><CardBody className="py-8 text-center text-xs text-muted">No enquiries logged yet.</CardBody></Card>
          ) : enquiries.map((e) => (
            <Card key={e.id}>
              <CardBody className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                <div>
                  <p className="font-semibold text-ink">{e.enquiryNumber} · {e.title}</p>
                  <p className="text-muted">{e.clientName} · Est. {formatCurrencyCompact(e.estimatedValue)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={e.stage} />
                  {canUpdate && (
                    <Select
                      className="w-36"
                      value={e.stage}
                      onChange={(ev) => runAction(() => erpService.crm.updateEnquiry(e.id, { stage: ev.target.value }))}
                      options={['new', 'site_visit', 'proposal', 'negotiation', 'won', 'lost'].map((s) => ({ value: s, label: s.replaceAll('_', ' ') }))}
                    />
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'handover' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader title="Project Handover & Warranties" />
            <CardBody className="space-y-2 text-xs">
              {handovers.length === 0 ? (
                <p className="py-4 text-center text-muted">No project handovers recorded yet.</p>
              ) : handovers.map((h) => (
                <div key={h.id} className="rounded border border-line p-2.5">
                  <p className="font-semibold text-ink">{h.project?.code} · {h.project?.name}</p>
                  <p className="text-muted">Handover {formatDate(h.handoverDate)} · Warranty {h.warrantyMonths}m (ends {formatDate(h.warrantyEndDate)})</p>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Client Complaints" />
            <CardBody className="space-y-2 text-xs">
              {complaints.length === 0 ? (
                <p className="py-4 text-center text-muted">No client complaints logged.</p>
              ) : complaints.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line p-2.5">
                  <div>
                    <p className="font-semibold text-ink">{c.complaintNumber} · {c.subject}</p>
                    <p className="text-muted">{c.project?.code || ''} · {c.priority}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={c.status} />
                    {canUpdate && c.status !== 'resolved' && c.status !== 'closed' && (
                      <Button size="sm" variant="secondary" onClick={() => runAction(() => erpService.crm.updateComplaint(c.id, { status: 'resolved' }))}>Resolve</Button>
                    )}
                    {canUpdate && c.status === 'resolved' && (
                      <Button size="sm" variant="secondary" onClick={() => runAction(() => erpService.crm.updateComplaint(c.id, { status: 'closed' }))}>Close</Button>
                    )}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      )}

      {cliModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => { e.preventDefault(); runAction(async () => { await erpService.crm.createClient(cliForm); setCliForm({ name: '', contactPerson: '', phone: '', city: '' }); setCliModal(false); }); }}>
              <CardHeader title="Add Client" icon={HeartHandshake} />
              <CardBody className="space-y-3">
                <Input required placeholder="Client / Organization Name *" value={cliForm.name} onChange={(e) => setCliForm({ ...cliForm, name: e.target.value })} />
                <Input placeholder="Contact Person" value={cliForm.contactPerson} onChange={(e) => setCliForm({ ...cliForm, contactPerson: e.target.value })} />
                <Input placeholder="Phone" value={cliForm.phone} onChange={(e) => setCliForm({ ...cliForm, phone: e.target.value })} />
                <Input placeholder="City" value={cliForm.city} onChange={(e) => setCliForm({ ...cliForm, city: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setCliModal(false)}>Cancel</Button>
                <Button type="submit">Save Client</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {enqModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => { e.preventDefault(); runAction(async () => { await erpService.crm.createEnquiry({ ...enqForm, estimatedValue: Number(enqForm.estimatedValue) }); setEnqForm({ clientName: '', title: '', estimatedValue: '0', stage: 'new' }); setEnqModal(false); }); }}>
              <CardHeader title="Log New Project Enquiry" />
              <CardBody className="space-y-3">
                <Input required placeholder="Client Name *" value={enqForm.clientName} onChange={(e) => setEnqForm({ ...enqForm, clientName: e.target.value })} />
                <Input required placeholder="Enquiry Title *" value={enqForm.title} onChange={(e) => setEnqForm({ ...enqForm, title: e.target.value })} />
                <Input type="number" placeholder="Estimated Value (₹)" value={enqForm.estimatedValue} onChange={(e) => setEnqForm({ ...enqForm, estimatedValue: e.target.value })} />
                <Select value={enqForm.stage} onChange={(e) => setEnqForm({ ...enqForm, stage: e.target.value })} options={['new', 'site_visit', 'proposal', 'negotiation', 'won', 'lost'].map((s) => ({ value: s, label: s.replaceAll('_', ' ') }))} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEnqModal(false)}>Cancel</Button>
                <Button type="submit">Log Enquiry</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {cmpModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => { e.preventDefault(); runAction(async () => { await erpService.crm.createComplaint({ ...cmpForm, project: cmpForm.project || selectedProjectId, client: cmpForm.client || null }); setCmpForm({ project: '', client: '', subject: '', priority: 'medium', description: '' }); setCmpModal(false); }); }}>
              <CardHeader title="Log Client Complaint / Snag" />
              <CardBody className="space-y-3">
                <Select required value={cmpForm.project || selectedProjectId} onChange={(e) => setCmpForm({ ...cmpForm, project: e.target.value })} placeholder="Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Select value={cmpForm.client} onChange={(e) => setCmpForm({ ...cmpForm, client: e.target.value })} placeholder="Client (optional)" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
                <Input required placeholder="Subject *" value={cmpForm.subject} onChange={(e) => setCmpForm({ ...cmpForm, subject: e.target.value })} />
                <Select value={cmpForm.priority} onChange={(e) => setCmpForm({ ...cmpForm, priority: e.target.value })} options={['low', 'medium', 'high', 'critical'].map((p) => ({ value: p, label: p }))} />
                <Textarea rows={2} placeholder="Complaint details" value={cmpForm.description} onChange={(e) => setCmpForm({ ...cmpForm, description: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setCmpModal(false)}>Cancel</Button>
                <Button type="submit">Log Complaint</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {hoModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => { e.preventDefault(); runAction(async () => { await erpService.crm.saveHandover({ ...hoForm, project: hoForm.project || selectedProjectId, client: hoForm.client || null, warrantyMonths: Number(hoForm.warrantyMonths || 12) }); setHoForm({ project: '', client: '', warrantyMonths: '12', snagsCleared: true, certificatesIssued: true, notes: '' }); setHoModal(false); }); }}>
              <CardHeader title="Record Project Handover & Warranty" />
              <CardBody className="space-y-3">
                <Select required value={hoForm.project || selectedProjectId} onChange={(e) => setHoForm({ ...hoForm, project: e.target.value })} placeholder="Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Select value={hoForm.client} onChange={(e) => setHoForm({ ...hoForm, client: e.target.value })} placeholder="Client (optional)" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
                <Input type="number" min="0" max="120" placeholder="Warranty Period (months)" value={hoForm.warrantyMonths} onChange={(e) => setHoForm({ ...hoForm, warrantyMonths: e.target.value })} />
                <Textarea rows={2} placeholder="Handover notes / snag clearance" value={hoForm.notes} onChange={(e) => setHoForm({ ...hoForm, notes: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setHoModal(false)}>Cancel</Button>
                <Button type="submit">Save Handover</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

