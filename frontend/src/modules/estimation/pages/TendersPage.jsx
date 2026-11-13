import { Award, Gavel, Plus, Scale } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import StatusBadge from '@/components/common/StatusBadge';
import TableToolbar from '@/components/tables/TableToolbar';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useWorkingProjectFilter } from '@/hooks/useWorkingProjectFilter';
import { estimationService } from '@/services/estimation.service';
import { procurementService } from '@/services/procurement.service';
import { formatCurrency, formatCurrencyCompact, formatDate } from '@/utils/format';

const TENDER_TYPE_OPTIONS = [
  { value: 'subcontractor_package', label: 'Subcontractor Package' },
  { value: 'material_package', label: 'Material Package' },
  { value: 'client_bid', label: 'Client Tender Bid' },
];

export default function TendersPage() {
  const { can } = useAuth();
  const canCreate = can(MODULES.ESTIMATION, ACTIONS.CREATE);
  const canUpdate = can(MODULES.ESTIMATION, ACTIONS.UPDATE);
  const canApprove = can(MODULES.ESTIMATION, ACTIONS.APPROVE);
  const [selectedProjectId] = useWorkingProjectFilter();

  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q, 250);
  const [state, setState] = useState({ items: [], loading: true, error: null });
  const [activeTender, setActiveTender] = useState(null);
  const [estimates, setEstimates] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [newTender, setNewTender] = useState({
    title: '',
    tenderType: 'subcontractor_package',
    estimate: '',
    submissionDeadline: '',
    estimatedValue: '',
    scopeSummary: '',
  });

  const [bidOpen, setBidOpen] = useState(false);
  const [newBid, setNewBid] = useState({
    bidderName: '',
    vendorRef: '',
    quotedAmount: '',
    technicalScore: '80',
    completionDays: '60',
    remarks: '',
  });
  const [errorBanner, setErrorBanner] = useState(null);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data } = await estimationService.listTenders({
        limit: 50,
        ...(debouncedQ ? { q: debouncedQ } : {}),
        ...(selectedProjectId ? { project: selectedProjectId } : {}),
      });
      setState({ items: data || [], loading: false, error: null });
      if (data?.length > 0 && !activeTender) {
        setActiveTender(data[0]);
      } else if (activeTender) {
        const refreshed = (data || []).find((t) => t.id === activeTender.id);
        setActiveTender(refreshed || data?.[0] || null);
      }
    } catch (error) {
      setState({ items: [], loading: false, error });
    }
  }, [debouncedQ, selectedProjectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    estimationService.listEstimates({ limit: 100 }).then(({ data }) => setEstimates(data || [])).catch(() => {});
    procurementService.listVendors({ limit: 100 }).then(({ data }) => setVendors(data || [])).catch(() => {});
  }, []);

  const handleCreateTender = async (e) => {
    e.preventDefault();
    setErrorBanner(null);
    try {
      const { data } = await estimationService.createTender({
        title: newTender.title.trim(),
        tenderType: newTender.tenderType,
        estimate: newTender.estimate || null,
        project: selectedProjectId || null,
        submissionDeadline: newTender.submissionDeadline || null,
        estimatedValue: Number(newTender.estimatedValue || 0),
        scopeSummary: newTender.scopeSummary.trim(),
      });
      setCreateOpen(false);
      setActiveTender(data);
      load();
    } catch (err) {
      setErrorBanner(err.message);
    }
  };

  const handleAddBid = async (e) => {
    e.preventDefault();
    if (!activeTender) return;
    setErrorBanner(null);
    try {
      const { data } = await estimationService.addBid(activeTender.id, {
        bidderName: newBid.bidderName.trim(),
        vendorRef: newBid.vendorRef || null,
        quotedAmount: Number(newBid.quotedAmount || 0),
        technicalScore: Number(newBid.technicalScore || 0),
        completionDays: Number(newBid.completionDays || 90),
        remarks: newBid.remarks.trim(),
      });
      setBidOpen(false);
      setActiveTender(data);
      load();
    } catch (err) {
      setErrorBanner(err.message);
    }
  };

  const handleAward = async (bidId) => {
    if (!activeTender) return;
    setErrorBanner(null);
    try {
      const { data } = await estimationService.awardTender(activeTender.id, {
        bidId,
        comment: 'Selected lowest responsive bid in comparison matrix',
      });
      setActiveTender(data);
      load();
    } catch (err) {
      setErrorBanner(err.message);
    }
  };

  if (state.loading && state.items.length === 0) return <PageLoader />;
  if (state.error) return <ErrorState error={state.error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tenders & Bid Comparison"
        description="Float tender packages, log vendor bids, compare pricing vs estimate, and award contracts."
        actions={
          canCreate && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New tender
            </Button>
          )
        }
      />

      {errorBanner && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{errorBanner}</div>}

      <Card>
        <TableToolbar search={q} onSearchChange={setQ} searchPlaceholder="Search tender number or title…" />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Tender Packages" />
          <CardBody className="space-y-2">
            {state.items.length === 0 ? (
              <p className="text-xs text-muted">No tenders created yet.</p>
            ) : (
              state.items.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTender(t)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    activeTender?.id === t.id ? 'border-navy-500 bg-navy-50' : 'border-line hover:bg-canvas'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-ink">{t.tenderNumber}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="mt-1 text-sm font-medium text-ink">{t.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    Est: {formatCurrencyCompact(t.estimatedValue)} · {t.bids?.length || 0} bids
                  </p>
                </button>
              ))
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          {activeTender ? (
            <>
              <CardHeader
                title={`${activeTender.tenderNumber} · ${activeTender.title}`}
                description={`Estimated Value: ${formatCurrency(activeTender.estimatedValue)}${activeTender.submissionDeadline ? ` · Deadline: ${formatDate(activeTender.submissionDeadline)}` : ''}`}
                actions={
                  canUpdate &&
                  !['awarded', 'closed', 'cancelled'].includes(activeTender.status) && (
                    <Button size="sm" leftIcon={Gavel} onClick={() => setBidOpen(true)}>
                      Log Bid
                    </Button>
                  )
                }
              />
              <CardBody className="space-y-4">
                {activeTender.scopeSummary && <p className="text-xs text-muted">{activeTender.scopeSummary}</p>}

                <div className="flex items-center gap-2 text-xs font-semibold text-ink">
                  <Scale className="h-4 w-4 text-brand-600" /> Bid Comparison Matrix
                  {activeTender.lowestBidAmount != null && (
                    <Badge tone="success">Lowest Bid: {formatCurrency(activeTender.lowestBidAmount)}</Badge>
                  )}
                </div>

                {activeTender.bids.length === 0 ? (
                  <p className="text-xs text-muted">No bidder submissions logged yet.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-border bg-surface-muted text-muted">
                        <tr>
                          <th className="px-3 py-2">Bidder / Vendor</th>
                          <th className="px-3 py-2 text-right">Quoted Amount</th>
                          <th className="px-3 py-2 text-right">vs Estimate</th>
                          <th className="px-3 py-2 text-right">Tech Score</th>
                          <th className="px-3 py-2 text-right">Duration</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {[...activeTender.bids]
                          .sort((a, b) => a.quotedAmount - b.quotedAmount)
                          .map((b, idx) => {
                            const variance =
                              activeTender.estimatedValue > 0
                                ? Math.round(((b.quotedAmount - activeTender.estimatedValue) / activeTender.estimatedValue) * 100)
                                : 0;
                            return (
                              <tr key={b.id}>
                                <td className="px-3 py-2 font-medium text-ink">
                                  {idx === 0 && <Badge tone="success" className="mr-1.5">L1</Badge>}
                                  {b.bidderName}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(b.quotedAmount)}</td>
                                <td className={`px-3 py-2 text-right tabular-nums ${variance <= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                  {variance > 0 ? `+${variance}%` : `${variance}%`}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{b.technicalScore}/100</td>
                                <td className="px-3 py-2 text-right tabular-nums">{b.completionDays}d</td>
                                <td className="px-3 py-2"><StatusBadge status={b.status} /></td>
                                <td className="px-3 py-2 text-right">
                                  {canApprove && !['awarded', 'closed', 'cancelled'].includes(activeTender.status) && (
                                    <Button size="sm" variant="secondary" leftIcon={Award} onClick={() => handleAward(b.id)}>
                                      Award
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </>
          ) : (
            <CardBody className="py-12 text-center text-xs text-muted">
              Select a tender package on the left to inspect its Bid Comparison Matrix.
            </CardBody>
          )}
        </Card>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg">
            <form onSubmit={handleCreateTender}>
              <CardHeader title="Float New Tender Package" />
              <CardBody className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-ink">Tender Title *</label>
                  <Input required value={newTender.title} onChange={(e) => setNewTender({ ...newTender, title: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-ink">Type</label>
                    <Select value={newTender.tenderType} onChange={(e) => setNewTender({ ...newTender, tenderType: e.target.value })} options={TENDER_TYPE_OPTIONS} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">Linked Estimate</label>
                    <Select
                      value={newTender.estimate}
                      onChange={(e) => setNewTender({ ...newTender, estimate: e.target.value })}
                      placeholder="Optional"
                      options={estimates.map((est) => ({ value: est.id, label: `${est.estimateNumber} · ${est.title}` }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">Deadline</label>
                    <Input type="date" value={newTender.submissionDeadline} onChange={(e) => setNewTender({ ...newTender, submissionDeadline: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">Estimated Value (₹)</label>
                    <Input type="number" value={newTender.estimatedValue} onChange={(e) => setNewTender({ ...newTender, estimatedValue: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-ink">Scope Summary</label>
                  <Textarea rows={2} value={newTender.scopeSummary} onChange={(e) => setNewTender({ ...newTender, scopeSummary: e.target.value })} />
                </div>
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button type="submit">Create Tender</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {bidOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={handleAddBid}>
              <CardHeader title={`Log Bid for ${activeTender?.tenderNumber}`} />
              <CardBody className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-ink">Select Registered Vendor (Optional)</label>
                  <Select
                    value={newBid.vendorRef}
                    onChange={(e) => {
                      const v = vendors.find((x) => x.id === e.target.value);
                      setNewBid((p) => ({ ...p, vendorRef: e.target.value, bidderName: v ? v.name : p.bidderName }));
                    }}
                    placeholder="External bidder"
                    options={vendors.map((v) => ({ value: v.id, label: `${v.code} · ${v.name}` }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink">Bidder Name *</label>
                  <Input required value={newBid.bidderName} onChange={(e) => setNewBid({ ...newBid, bidderName: e.target.value })} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs font-medium text-ink">Quoted ₹ *</label>
                    <Input required type="number" value={newBid.quotedAmount} onChange={(e) => setNewBid({ ...newBid, quotedAmount: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">Tech Score</label>
                    <Input type="number" max="100" value={newBid.technicalScore} onChange={(e) => setNewBid({ ...newBid, technicalScore: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink">Days</label>
                    <Input type="number" value={newBid.completionDays} onChange={(e) => setNewBid({ ...newBid, completionDays: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-ink">Remarks</label>
                  <Textarea rows={2} value={newBid.remarks} onChange={(e) => setNewBid({ ...newBid, remarks: e.target.value })} />
                </div>
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setBidOpen(false)}>Cancel</Button>
                <Button type="submit">Log Bid</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
