import { CheckCircle2, Plus, Scale, XCircle } from 'lucide-react';
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
import { formatCurrency, formatDate } from '@/utils/format';

export default function LegalWorkspacePage() {
  const { can } = useAuth();
  const canCreate = can(MODULES.LEGAL, ACTIONS.CREATE);
  const canUpdate = can(MODULES.LEGAL, ACTIONS.UPDATE);
  const canApprove = can(MODULES.LEGAL, ACTIONS.APPROVE);
  const canReject = canApprove || can(MODULES.LEGAL, ACTIONS.REJECT);
  const [selectedProjectId] = useWorkingProjectFilter();

  const [tab, setTab] = useState('permits');
  const [agreements, setAgreements] = useState([]);
  const [permits, setPermits] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bannerError, setBannerError] = useState('');

  const [permModal, setPermModal] = useState(false);
  const [permForm, setPermForm] = useState({ title: '', recordType: 'permit', authorityOrInsurer: '', expiryDate: '', project: '' });
  const [agrModal, setAgrModal] = useState(false);
  const [agrForm, setAgrForm] = useState({ project: '', partyType: 'contractor', partyName: '', title: '', contractValue: '0', expiryDate: '', obligations: '' });
  const [amendModal, setAmendModal] = useState({ open: false, agr: null, summary: '', valueDelta: '0' });
  const [dispModal, setDispModal] = useState(false);
  const [dispForm, setDispForm] = useState({ project: '', partyName: '', disputeType: 'notice', title: '', claimAmount: '0', summary: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setBannerError('');
    try {
      const [a, p, d] = await Promise.all([
        erpService.legal.listAgreements(),
        erpService.legal.listPermits(),
        erpService.legal.listDisputes(),
      ]);
      setAgreements(a.data || []);
      setPermits(p.data || []);
      setDisputes(d.data || []);
    } catch (err) {
      setBannerError(err?.response?.data?.message || err?.message || 'Failed to load legal records');
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
        title="Legal & Compliance"
        description="Track client/vendor/contractor agreements, regulatory permits, insurance policies, and expiry alerts."
        actions={
          canCreate && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setDispModal(true)}>Dispute / Notice</Button>
              <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setAgrModal(true)}>Agreement</Button>
              <Button size="sm" leftIcon={Plus} onClick={() => setPermModal(true)}>Permit / Licence</Button>
            </div>
          )
        }
      />

      {bannerError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{bannerError}</div>
      )}

      <div className="flex gap-1 border-b border-line pb-1">
        {[{ key: 'permits', label: 'Permits & Insurance' }, { key: 'agreements', label: 'Contracts Register' }, { key: 'disputes', label: 'Disputes & Notices' }].map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === t.key ? 'bg-navy-900 text-white' : 'text-muted hover:bg-canvas'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'permits' && (
        <div className="grid gap-3 md:grid-cols-3">
          {permits.length === 0 ? (
            <Card className="md:col-span-3"><CardBody className="py-8 text-center text-xs text-muted">No permits or insurance policies recorded yet.</CardBody></Card>
          ) : permits.map((p) => (
            <Card key={p.id}>
              <CardBody className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="font-mono font-semibold">{p.permitNumber}</span>
                  <StatusBadge status={p.status} />
                </div>
                <p className="text-sm font-medium text-ink">{p.title}</p>
                <p className="text-muted">{p.authorityOrInsurer} · Expires {formatDate(p.expiryDate)}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'agreements' && (
        <div className="space-y-2">
          {agreements.length === 0 ? (
            <Card><CardBody className="py-8 text-center text-xs text-muted">No legal agreements drafted yet. Click &ldquo;+ Agreement&rdquo; to register one.</CardBody></Card>
          ) : agreements.map((a) => (
            <Card key={a.id}>
              <CardBody className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                <div>
                  <p className="font-semibold text-ink">{a.agreementNumber} · {a.title}</p>
                  <p className="text-muted">{a.partyName} ({a.partyType}) · {formatCurrency(a.contractValue)}{a.amendments?.length ? ` · ${a.amendments.length} amendment(s)` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={a.status} />
                  {canUpdate && (
                    <Button size="sm" variant="secondary" onClick={() => setAmendModal({ open: true, agr: a, summary: '', valueDelta: '0' })}>+ Amendment</Button>
                  )}
                  {a.status === 'draft' && canCreate && (
                    <Button size="sm" variant="secondary" onClick={() => runAction(() => erpService.legal.transitionAgreement(a.id, { status: 'submitted' }))}>Submit</Button>
                  )}
                  {a.status === 'submitted' && canApprove && (
                    <Button size="sm" leftIcon={CheckCircle2} onClick={() => runAction(() => erpService.legal.transitionAgreement(a.id, { status: 'approved' }))}>Approve</Button>
                  )}
                  {a.status === 'submitted' && canReject && (
                    <Button size="sm" variant="danger" leftIcon={XCircle} onClick={() => runAction(() => erpService.legal.transitionAgreement(a.id, { status: 'rejected' }))}>Reject</Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'disputes' && (
        <div className="space-y-2">
          {disputes.length === 0 ? (
            <Card><CardBody className="py-8 text-center text-xs text-muted">No disputes, claims, or legal notices recorded.</CardBody></Card>
          ) : disputes.map((d) => (
            <Card key={d.id}>
              <CardBody className="flex items-center justify-between py-3 text-xs">
                <div>
                  <p className="font-semibold text-ink">{d.caseNumber} · {d.title}</p>
                  <p className="text-muted">{d.partyName} ({d.disputeType}) · Claim {formatCurrency(d.claimAmount)}</p>
                </div>
                <StatusBadge status={d.status} />
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {permModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => { e.preventDefault(); runAction(async () => { await erpService.legal.createPermit({ ...permForm, project: permForm.project || selectedProjectId || null }); setPermForm({ title: '', recordType: 'permit', authorityOrInsurer: '', expiryDate: '', project: '' }); setPermModal(false); }); }}>
              <CardHeader title="Add Regulatory Permit / Insurance" icon={Scale} />
              <CardBody className="space-y-3">
                <Input required placeholder="Permit / Policy Title *" value={permForm.title} onChange={(e) => setPermForm({ ...permForm, title: e.target.value })} />
                <Select value={permForm.recordType} onChange={(e) => setPermForm({ ...permForm, recordType: e.target.value })} options={['permit', 'license', 'insurance'].map((r) => ({ value: r, label: r }))} />
                <Input required placeholder="Issuing Authority / Insurer *" value={permForm.authorityOrInsurer} onChange={(e) => setPermForm({ ...permForm, authorityOrInsurer: e.target.value })} />
                <Select value={permForm.project || selectedProjectId} onChange={(e) => setPermForm({ ...permForm, project: e.target.value })} placeholder="Company-wide or Project" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <div>
                  <label className="text-xs font-medium text-ink">Expiry Date *</label>
                  <Input required type="date" value={permForm.expiryDate} onChange={(e) => setPermForm({ ...permForm, expiryDate: e.target.value })} />
                </div>
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setPermModal(false)}>Cancel</Button>
                <Button type="submit">Save</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {agrModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => { e.preventDefault(); runAction(async () => { await erpService.legal.createAgreement({ ...agrForm, project: agrForm.project || selectedProjectId || null, contractValue: Number(agrForm.contractValue || 0) }); setAgrForm({ project: '', partyType: 'contractor', partyName: '', title: '', contractValue: '0', expiryDate: '', obligations: '' }); setAgrModal(false); }); }}>
              <CardHeader title="Draft Contract / Legal Agreement" icon={Scale} />
              <CardBody className="space-y-3">
                <Input required placeholder="Agreement Title *" value={agrForm.title} onChange={(e) => setAgrForm({ ...agrForm, title: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={agrForm.partyType} onChange={(e) => setAgrForm({ ...agrForm, partyType: e.target.value })} options={['contractor', 'vendor', 'client', 'other'].map((t) => ({ value: t, label: t }))} />
                  <Input required placeholder="Counterparty Name *" value={agrForm.partyName} onChange={(e) => setAgrForm({ ...agrForm, partyName: e.target.value })} />
                </div>
                <Select value={agrForm.project || selectedProjectId} onChange={(e) => setAgrForm({ ...agrForm, project: e.target.value })} placeholder="Company-wide or Project" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" min="0" placeholder="Contract Value (₹)" value={agrForm.contractValue} onChange={(e) => setAgrForm({ ...agrForm, contractValue: e.target.value })} />
                  <Input type="date" value={agrForm.expiryDate} onChange={(e) => setAgrForm({ ...agrForm, expiryDate: e.target.value })} />
                </div>
                <Textarea rows={2} placeholder="Key obligations / terms" value={agrForm.obligations} onChange={(e) => setAgrForm({ ...agrForm, obligations: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setAgrModal(false)}>Cancel</Button>
                <Button type="submit">Draft Agreement</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {amendModal.open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => { e.preventDefault(); runAction(async () => { await erpService.legal.addAmendment(amendModal.agr.id, { summary: amendModal.summary, valueDelta: Number(amendModal.valueDelta || 0) }); setAmendModal({ open: false, agr: null, summary: '', valueDelta: '0' }); }); }}>
              <CardHeader title={`Add Amendment · ${amendModal.agr?.agreementNumber}`} />
              <CardBody className="space-y-3">
                <Textarea required rows={2} placeholder="Amendment summary *" value={amendModal.summary} onChange={(e) => setAmendModal((p) => ({ ...p, summary: e.target.value }))} />
                <Input type="number" placeholder="Contract Value Change (₹, + or -)" value={amendModal.valueDelta} onChange={(e) => setAmendModal((p) => ({ ...p, valueDelta: e.target.value }))} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setAmendModal({ open: false, agr: null, summary: '', valueDelta: '0' })}>Cancel</Button>
                <Button type="submit">Save Amendment</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {dispModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => { e.preventDefault(); runAction(async () => { await erpService.legal.createDispute({ ...dispForm, project: dispForm.project || selectedProjectId || null, claimAmount: Number(dispForm.claimAmount || 0) }); setDispForm({ project: '', partyName: '', disputeType: 'notice', title: '', claimAmount: '0', summary: '' }); setDispModal(false); }); }}>
              <CardHeader title="Log Dispute / Legal Notice" />
              <CardBody className="space-y-3">
                <Input required placeholder="Notice / Case Title *" value={dispForm.title} onChange={(e) => setDispForm({ ...dispForm, title: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={dispForm.disputeType} onChange={(e) => setDispForm({ ...dispForm, disputeType: e.target.value })} options={['notice', 'claim', 'arbitration', 'litigation'].map((t) => ({ value: t, label: t }))} />
                  <Input required placeholder="Party Name *" value={dispForm.partyName} onChange={(e) => setDispForm({ ...dispForm, partyName: e.target.value })} />
                </div>
                <Select value={dispForm.project || selectedProjectId} onChange={(e) => setDispForm({ ...dispForm, project: e.target.value })} placeholder="Company-wide or Project" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Input type="number" min="0" placeholder="Claim Amount (₹)" value={dispForm.claimAmount} onChange={(e) => setDispForm({ ...dispForm, claimAmount: e.target.value })} />
                <Textarea rows={2} placeholder="Case summary" value={dispForm.summary} onChange={(e) => setDispForm({ ...dispForm, summary: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setDispModal(false)}>Cancel</Button>
                <Button type="submit">Log Case</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

