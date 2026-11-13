import { Award, Plus, Scale } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import StatusBadge from '@/components/common/StatusBadge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useWorkingProjectFilter } from '@/hooks/useWorkingProjectFilter';
import { erpService } from '@/services/erp.service';
import { inventoryService } from '@/services/inventory.service';
import { procurementService } from '@/services/procurement.service';
import { projectsService } from '@/services/projects.service';
import { formatCurrency } from '@/utils/format';

export default function RfqsAndReturnsPage() {
  const { can } = useAuth();
  const canCreate = can(MODULES.PROCUREMENT, ACTIONS.CREATE);
  const canApprove = can(MODULES.PROCUREMENT, ACTIONS.APPROVE);
  const [selectedProjectId] = useWorkingProjectFilter();

  const [rfqs, setRfqs] = useState([]);
  const [returns, setReturns] = useState([]);
  const [projects, setProjects] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bannerError, setBannerError] = useState('');

  const [rfqOpen, setRfqOpen] = useState(false);
  const [rfqForm, setRfqForm] = useState({ title: '', project: '', vendor: '', material: '', quantity: '', unit: 'bags' });
  const [quoteModal, setQuoteModal] = useState({ open: false, rfq: null, vendor: '', unitRate: '' });
  const [retModal, setRetModal] = useState(false);
  const [retForm, setRetForm] = useState({ purchaseOrder: '', material: '', returnedQuantity: '', unit: 'bags', reason: 'Quality rejection / damaged goods' });

  const load = useCallback(async () => {
    setLoading(true);
    setBannerError('');
    try {
      const [rRes, retRes] = await Promise.all([
        erpService.procurementExtra.listRfqs(),
        erpService.procurementExtra.listReturns(),
      ]);
      setRfqs(rRes.data || []);
      setReturns(retRes.data || []);
    } catch (err) {
      setBannerError(err?.response?.data?.message || err?.message || 'Failed to load RFQs & returns');
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
    procurementService.listVendors({ limit: 100 }).then(({ data }) => setVendors(data || [])).catch(() => {});
    procurementService.listPos({ limit: 100 }).then(({ data }) => setPos(data || [])).catch(() => {});
    inventoryService.listMaterials({ limit: 100 }).then(({ data }) => setMaterials(data || [])).catch(() => {});
  }, [load]);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="RFQs, Quotations & Purchase Returns"
        description="Float supplier RFQs, compare vendor quotations side-by-side, award POs, and track debit returns."
        actions={
          canCreate && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setRetModal(true)}>Purchase Return</Button>
              <Button size="sm" leftIcon={Plus} onClick={() => setRfqOpen(true)}>Create RFQ</Button>
            </div>
          )
        }
      />

      {bannerError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{bannerError}</div>
      )}

      <div className="space-y-3">
        {rfqs.length === 0 ? (
          <Card><CardBody className="py-8 text-center text-xs text-muted">No supplier RFQs created yet.</CardBody></Card>
        ) : rfqs.map((r) => (
          <Card key={r.id}>
            <CardHeader
              title={`${r.rfqNumber} · ${r.title}`}
              description={`${r.project?.code || ''} · ${r.items?.length || 0} item(s)`}
              icon={Scale}
              actions={
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  {r.status !== 'awarded' && (
                    <Button size="sm" variant="secondary" onClick={() => setQuoteModal({ open: true, rfq: r, vendor: r.vendors?.[0]?._id || '', unitRate: '' })}>Log Quote</Button>
                  )}
                </div>
              }
            />
            <CardBody className="space-y-2 text-xs">
              {r.quotations?.length > 0 && (
                <div className="space-y-1">
                  {[...r.quotations].sort((a, b) => a.quotedTotal - b.quotedTotal).map((q) => (
                    <div key={q._id} className="flex items-center justify-between rounded border border-line px-3 py-1.5">
                      <span>{q.vendor?.name || 'Vendor'} · Quote Total: <strong>{formatCurrency(q.quotedTotal)}</strong></span>
                      {canApprove && r.status !== 'awarded' ? (
                        <Button size="sm" variant="secondary" leftIcon={Award} onClick={() => runAction(() => erpService.procurementExtra.awardRfq(r.id, { vendor: q.vendor._id }))}>Award & Draft PO</Button>
                      ) : q.isAwarded ? (
                        <span className="font-semibold text-emerald-700">Awarded ({r.generatedPo?.poNumber})</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Purchase Returns & Debit Notes" />
        <CardBody className="space-y-2 text-xs">
          {returns.length === 0 ? (
            <p className="py-4 text-center text-muted">No purchase returns recorded yet.</p>
          ) : returns.map((pr) => (
            <div key={pr.id} className="flex justify-between rounded border border-line px-3 py-2">
              <span>{pr.returnNumber} · {pr.vendor?.name} · PO {pr.purchaseOrder?.poNumber}</span>
              <strong>{formatCurrency(pr.totalAmount)}</strong>
            </div>
          ))}
        </CardBody>
      </Card>

      {rfqOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
                await erpService.procurementExtra.createRfq({
                  title: rfqForm.title,
                  project: rfqForm.project || selectedProjectId,
                  vendors: [rfqForm.vendor],
                  items: [{ material: rfqForm.material, quantity: Number(rfqForm.quantity), unit: rfqForm.unit }],
                });
                setRfqOpen(false);
              });
            }}>
              <CardHeader title="Create Supplier RFQ" />
              <CardBody className="space-y-3">
                <Input required placeholder="RFQ Title *" value={rfqForm.title} onChange={(e) => setRfqForm({ ...rfqForm, title: e.target.value })} />
                <Select required value={rfqForm.project || selectedProjectId} onChange={(e) => setRfqForm({ ...rfqForm, project: e.target.value })} placeholder="Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Select required value={rfqForm.vendor} onChange={(e) => setRfqForm({ ...rfqForm, vendor: e.target.value })} placeholder="Primary Vendor *" options={vendors.map((v) => ({ value: v.id, label: v.name }))} />
                <Select required value={rfqForm.material} onChange={(e) => {
                  const m = materials.find((x) => x.id === e.target.value);
                  setRfqForm({ ...rfqForm, material: e.target.value, unit: m?.unit || 'nos' });
                }} placeholder="Material *" options={materials.map((m) => ({ value: m.id, label: m.name }))} />
                <Input required type="number" step="0.01" placeholder="Quantity *" value={rfqForm.quantity} onChange={(e) => setRfqForm({ ...rfqForm, quantity: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setRfqOpen(false)}>Cancel</Button>
                <Button type="submit">Float RFQ</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {quoteModal.open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
                await erpService.procurementExtra.addQuotation(quoteModal.rfq.id, {
                  vendor: quoteModal.vendor,
                  items: quoteModal.rfq.items.map((it) => ({ material: it.material?._id || it.material, unitRate: Number(quoteModal.unitRate), taxPercent: 18 })),
                });
                setQuoteModal({ open: false, rfq: null, vendor: '', unitRate: '' });
              });
            }}>
              <CardHeader title={`Log Quote for ${quoteModal.rfq?.rfqNumber}`} />
              <CardBody className="space-y-3">
                <Select required value={quoteModal.vendor} onChange={(e) => setQuoteModal((p) => ({ ...p, vendor: e.target.value }))} placeholder="Select Vendor *" options={vendors.map((v) => ({ value: v.id, label: v.name }))} />
                <Input required type="number" step="0.01" placeholder="Quoted Unit Rate (₹) *" value={quoteModal.unitRate} onChange={(e) => setQuoteModal((p) => ({ ...p, unitRate: e.target.value }))} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setQuoteModal({ open: false, rfq: null, vendor: '', unitRate: '' })}>Cancel</Button>
                <Button type="submit">Save Quote</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {retModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
                await erpService.procurementExtra.createReturn({
                  purchaseOrder: retForm.purchaseOrder,
                  reason: retForm.reason,
                  items: [{ material: retForm.material, returnedQuantity: Number(retForm.returnedQuantity), unit: retForm.unit }],
                });
                setRetForm({ purchaseOrder: '', material: '', returnedQuantity: '', unit: 'bags', reason: 'Quality rejection / damaged goods' });
                setRetModal(false);
              });
            }}>
              <CardHeader title="Record Purchase Return & Debit Note" />
              <CardBody className="space-y-3">
                <Select required value={retForm.purchaseOrder} onChange={(e) => setRetForm({ ...retForm, purchaseOrder: e.target.value })} placeholder="Purchase Order *" options={pos.map((po) => ({ value: po.id, label: `${po.poNumber} · ${po.vendor?.name || 'Vendor'}` }))} />
                <Select required value={retForm.material} onChange={(e) => {
                  const m = materials.find((x) => x.id === e.target.value);
                  setRetForm({ ...retForm, material: e.target.value, unit: m?.unit || 'nos' });
                }} placeholder="Material *" options={materials.map((m) => ({ value: m.id, label: m.name }))} />
                <Input required type="number" min="0.01" step="0.01" placeholder="Returned Quantity *" value={retForm.returnedQuantity} onChange={(e) => setRetForm({ ...retForm, returnedQuantity: e.target.value })} />
                <Input required placeholder="Reason for return *" value={retForm.reason} onChange={(e) => setRetForm({ ...retForm, reason: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setRetModal(false)}>Cancel</Button>
                <Button type="submit">Record Return</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

