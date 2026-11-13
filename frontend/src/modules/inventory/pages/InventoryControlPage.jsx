import { CheckCircle2, ClipboardCheck, Plus, Search, Warehouse as WhIcon } from 'lucide-react';
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
import { projectsService } from '@/services/projects.service';
import { formatCurrency, formatDate } from '@/utils/format';

export default function InventoryControlPage() {
  const { can } = useAuth();
  const canCreate = can(MODULES.INVENTORY, ACTIONS.CREATE);
  const canApprove = can(MODULES.INVENTORY, ACTIONS.APPROVE);
  const [selectedProjectId] = useWorkingProjectFilter();

  const [tab, setTab] = useState('valuation');
  const [valuation, setValuation] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [verifications, setVerifications] = useState([]);
  const [projects, setProjects] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [barcode, setBarcode] = useState('');
  const [barcodeHit, setBarcodeHit] = useState(null);
  const [loading, setLoading] = useState(true);

  const [whOpen, setWhOpen] = useState(false);
  const [whForm, setWhForm] = useState({ code: '', name: '', type: 'site_store', project: '', location: '' });
  const [verOpen, setVerOpen] = useState(false);
  const [verForm, setVerForm] = useState({ project: '', material: '', physicalQty: '', reason: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const params = selectedProjectId ? { project: selectedProjectId } : {};
    const [valRes, whRes, verRes] = await Promise.all([
      erpService.inventoryExtra.getValuation(params),
      erpService.inventoryExtra.listWarehouses(params),
      erpService.inventoryExtra.listVerifications(params),
    ]);
    setValuation(valRes.data || []);
    setWarehouses(whRes.data || []);
    setVerifications(verRes.data || []);
    setLoading(false);
  }, [selectedProjectId]);

  useEffect(() => {
    load();
    projectsService.list({ limit: 100 }).then(({ data }) => setProjects(data || [])).catch(() => {});
    inventoryService.listMaterials({ limit: 100 }).then(({ data }) => setMaterials(data || [])).catch(() => {});
  }, [load]);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Warehouses, Valuation & Stock Audits"
        description="Weighted-average inventory valuation, project stores, barcode lookup, and cycle count adjustments."
        actions={
          canCreate && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" leftIcon={WhIcon} onClick={() => setWhOpen(true)}>Add Store</Button>
              <Button size="sm" leftIcon={Plus} onClick={() => setVerOpen(true)}>New Cycle Count</Button>
            </div>
          )
        }
      />

      <Card>
        <CardBody className="flex flex-wrap items-center gap-2 py-3">
          <Input className="max-w-xs" placeholder="Scan or enter barcode / material code…" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
          <Button
            size="sm"
            variant="secondary"
            leftIcon={Search}
            onClick={async () => {
              if (!barcode.trim()) return;
              try {
                const res = await erpService.inventoryExtra.lookupBarcode(barcode.trim());
                setBarcodeHit(res.data);
              } catch {
                setBarcodeHit({ error: 'Not found' });
              }
            }}
          >
            Lookup Code
          </Button>
          {barcodeHit && (
            <span className="text-xs text-ink">
              {barcodeHit.error ? barcodeHit.error : `${barcodeHit.code} · ${barcodeHit.name} (${barcodeHit.unit})`}
            </span>
          )}
        </CardBody>
      </Card>

      <div className="flex gap-1 border-b border-line pb-1">
        {[
          { key: 'valuation', label: 'Weighted-Avg Valuation' },
          { key: 'warehouses', label: 'Warehouses & Stores' },
          { key: 'verifications', label: 'Cycle Verifications' },
        ].map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === t.key ? 'bg-navy-900 text-white' : 'text-muted hover:bg-canvas'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'valuation' && (
        <Card>
          <CardBody className="p-0">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-canvas text-muted">
                <tr>
                  <th className="px-4 py-2">Project</th>
                  <th className="px-4 py-2">Material</th>
                  <th className="px-4 py-2 text-right">Stock Qty</th>
                  <th className="px-4 py-2 text-right">Weighted Avg Rate</th>
                  <th className="px-4 py-2 text-right">Total Valuation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {valuation.map((v, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2 font-medium">{v.project.code}</td>
                    <td className="px-4 py-2">{v.material.code} · {v.material.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{v.currentStock} {v.material.unit}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(v.weightedAvgRate)}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatCurrency(v.valuationValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {tab === 'warehouses' && (
        <div className="grid gap-3 md:grid-cols-3">
          {warehouses.map((w) => (
            <Card key={w.id}>
              <CardBody className="space-y-1 text-xs">
                <p className="font-mono font-semibold text-ink">{w.code}</p>
                <p className="text-sm font-medium text-ink">{w.name}</p>
                <p className="text-muted">{w.type} · {w.project?.code || 'Central'}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'verifications' && (
        <div className="space-y-3">
          {verifications.map((v) => (
            <Card key={v.id}>
              <CardHeader
                title={`${v.verificationNumber} · ${v.project?.code || ''}`}
                description={formatDate(v.verificationDate)}
                icon={ClipboardCheck}
                actions={
                  <div className="flex items-center gap-2">
                    <StatusBadge status={v.status} />
                    {v.status === 'draft' && canCreate && (
                      <Button size="sm" variant="secondary" onClick={async () => { await erpService.inventoryExtra.transitionVerification(v.id, { status: 'submitted' }); load(); }}>Submit</Button>
                    )}
                    {v.status === 'submitted' && canApprove && (
                      <Button size="sm" leftIcon={CheckCircle2} onClick={async () => { await erpService.inventoryExtra.transitionVerification(v.id, { status: 'approved' }); load(); }}>Approve & Adjust</Button>
                    )}
                  </div>
                }
              />
              <CardBody className="space-y-1 text-xs">
                {v.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{it.material?.name || 'Material'}</span>
                    <span>System: {it.systemQty} | Physical: {it.physicalQty} | Variance: <strong>{it.variance}</strong></span>
                  </div>
                ))}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {whOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={async (e) => { e.preventDefault(); await erpService.inventoryExtra.createWarehouse({ ...whForm, project: whForm.project || selectedProjectId || null }); setWhOpen(false); load(); }}>
              <CardHeader title="Add Store / Warehouse" />
              <CardBody className="space-y-3">
                <Input required placeholder="Store Code (e.g. WH-SOUTH) *" value={whForm.code} onChange={(e) => setWhForm({ ...whForm, code: e.target.value })} />
                <Input required placeholder="Store Name *" value={whForm.name} onChange={(e) => setWhForm({ ...whForm, name: e.target.value })} />
                <Select value={whForm.type} onChange={(e) => setWhForm({ ...whForm, type: e.target.value })} options={[{ value: 'site_store', label: 'Site Store' }, { value: 'central', label: 'Central Warehouse' }]} />
                <Select value={whForm.project || selectedProjectId} onChange={(e) => setWhForm({ ...whForm, project: e.target.value })} placeholder="Select Project (if site store)" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setWhOpen(false)}>Cancel</Button>
                <Button type="submit">Create</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {verOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={async (e) => { e.preventDefault(); await erpService.inventoryExtra.createVerification({ project: verForm.project || selectedProjectId, items: [{ material: verForm.material, physicalQty: Number(verForm.physicalQty), reason: verForm.reason }] }); setVerOpen(false); load(); }}>
              <CardHeader title="Record Cycle Count" />
              <CardBody className="space-y-3">
                <Select required value={verForm.project || selectedProjectId} onChange={(e) => setVerForm({ ...verForm, project: e.target.value })} placeholder="Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Select required value={verForm.material} onChange={(e) => setVerForm({ ...verForm, material: e.target.value })} placeholder="Material *" options={materials.map((m) => ({ value: m.id, label: `${m.code} · ${m.name}` }))} />
                <Input required type="number" step="0.01" placeholder="Physical Count Quantity *" value={verForm.physicalQty} onChange={(e) => setVerForm({ ...verForm, physicalQty: e.target.value })} />
                <Input placeholder="Variance Reason" value={verForm.reason} onChange={(e) => setVerForm({ ...verForm, reason: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setVerOpen(false)}>Cancel</Button>
                <Button type="submit">Save Verification</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

