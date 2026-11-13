import { Plus, Wrench } from 'lucide-react';
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
import { projectsService } from '@/services/projects.service';
import { formatCurrency, formatDate } from '@/utils/format';

export default function EquipmentWorkspacePage({ initialTab = 'register' }) {
  const { can } = useAuth();
  const canCreate = can(MODULES.EQUIPMENT, ACTIONS.CREATE);
  const canUpdate = can(MODULES.EQUIPMENT, ACTIONS.UPDATE);
  const [selectedProjectId] = useWorkingProjectFilter();

  const [tab, setTab] = useState(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  const [items, setItems] = useState([]);
  const [logs, setLogs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const [eqModal, setEqModal] = useState(false);
  const [eqForm, setEqForm] = useState({ name: '', category: 'Heavy Machinery', ownershipType: 'owned', dailyRate: '0', project: '' });
  const [logModal, setLogModal] = useState(false);
  const [logForm, setLogForm] = useState({ equipment: '', project: '', logType: 'usage', hoursOperated: '8', maintenanceCost: '0', description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const params = selectedProjectId ? { project: selectedProjectId } : {};
    const [e, l] = await Promise.all([erpService.equipment.list(params), erpService.equipment.listLogs(params)]);
    setItems(e.data || []);
    setLogs(l.data || []);
    setLoading(false);
  }, [selectedProjectId]);

  useEffect(() => {
    load();
    projectsService.list({ limit: 100 }).then(({ data }) => setProjects(data || [])).catch(() => {});
  }, [load]);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Equipment & Maintenance"
        description="Track owned and hired machinery, site deployment, operating hours, fuel, and breakdowns."
        actions={
          <div className="flex gap-2">
            {(canCreate || canUpdate) && <Button size="sm" variant="secondary" leftIcon={Wrench} onClick={() => setLogModal(true)}>Log Usage / Maint</Button>}
            {canCreate && <Button size="sm" leftIcon={Plus} onClick={() => setEqModal(true)}>Add Equipment</Button>}
          </div>
        }
      />

      <div className="flex gap-1 border-b border-line pb-1">
        {[{ key: 'register', label: 'Equipment Register' }, { key: 'maintenance', label: 'Usage & Maintenance Logs' }].map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === t.key ? 'bg-navy-900 text-white' : 'text-muted hover:bg-canvas'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'register' && (
        <div className="grid gap-3 md:grid-cols-3">
          {items.map((e) => (
            <Card key={e.id}>
              <CardBody className="space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold">{e.code}</span>
                  <StatusBadge status={e.status} />
                </div>
                <p className="text-sm font-medium text-ink">{e.name}</p>
                <p className="text-muted">{e.category} · {e.ownershipType} · {formatCurrency(e.dailyRate)}/day</p>
                <p className="text-muted">{e.project?.code || 'Central Yard'}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'maintenance' && (
        <div className="space-y-2">
          {logs.map((l) => (
            <Card key={l.id}>
              <CardBody className="flex items-center justify-between py-2.5 text-xs">
                <div>
                  <p className="font-semibold text-ink">{l.equipment?.code} · {l.equipment?.name} ({l.logType})</p>
                  <p className="text-muted">{formatDate(l.logDate)} · {l.hoursOperated}h · {l.description || 'Routine log'}</p>
                </div>
                <strong>{formatCurrency((l.fuelCost || 0) + (l.maintenanceCost || 0) + (l.rentalCost || 0))}</strong>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {eqModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={async (e) => { e.preventDefault(); await erpService.equipment.create({ ...eqForm, project: eqForm.project || selectedProjectId || null, dailyRate: Number(eqForm.dailyRate) }); setEqModal(false); load(); }}>
              <CardHeader title="Register Equipment" />
              <CardBody className="space-y-3">
                <Input required placeholder="Equipment Name *" value={eqForm.name} onChange={(e) => setEqForm({ ...eqForm, name: e.target.value })} />
                <Select value={eqForm.ownershipType} onChange={(e) => setEqForm({ ...eqForm, ownershipType: e.target.value })} options={['owned', 'rented', 'leased'].map((o) => ({ value: o, label: o }))} />
                <Select value={eqForm.project || selectedProjectId} onChange={(e) => setEqForm({ ...eqForm, project: e.target.value })} placeholder="Assign to Project (Optional)" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Input type="number" placeholder="Daily Rate (₹)" value={eqForm.dailyRate} onChange={(e) => setEqForm({ ...eqForm, dailyRate: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEqModal(false)}>Cancel</Button>
                <Button type="submit">Save</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {logModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={async (e) => { e.preventDefault(); await erpService.equipment.createLog({ ...logForm, project: logForm.project || selectedProjectId, hoursOperated: Number(logForm.hoursOperated), maintenanceCost: Number(logForm.maintenanceCost) }); setLogModal(false); load(); }}>
              <CardHeader title="Record Equipment Log" />
              <CardBody className="space-y-3">
                <Select required value={logForm.equipment} onChange={(e) => setLogForm({ ...logForm, equipment: e.target.value })} placeholder="Equipment *" options={items.map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` }))} />
                <Select required value={logForm.project || selectedProjectId} onChange={(e) => setLogForm({ ...logForm, project: e.target.value })} placeholder="Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Select value={logForm.logType} onChange={(e) => setLogForm({ ...logForm, logType: e.target.value })} options={['usage', 'fuel', 'maintenance', 'breakdown'].map((t) => ({ value: t, label: t }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" step="0.5" placeholder="Hours" value={logForm.hoursOperated} onChange={(e) => setLogForm({ ...logForm, hoursOperated: e.target.value })} />
                  <Input type="number" placeholder="Maint/Fuel Cost ₹" value={logForm.maintenanceCost} onChange={(e) => setLogForm({ ...logForm, maintenanceCost: e.target.value })} />
                </div>
                <Input placeholder="Notes" value={logForm.description} onChange={(e) => setLogForm({ ...logForm, description: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setLogModal(false)}>Cancel</Button>
                <Button type="submit">Log Entry</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

