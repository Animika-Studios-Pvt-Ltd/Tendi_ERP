import { CheckCircle2, FileText, GitCommit, MessageSquarePlus, Plus, Send, Upload } from 'lucide-react';
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
import { formatDate } from '@/utils/format';

const TABS = [
  { key: 'docs', label: 'Documents Repository' },
  { key: 'drawings', label: 'Drawing Register' },
  { key: 'rfis', label: 'RFIs' },
  { key: 'submittals', label: 'Submittals & Transmittals' },
];

export default function DocumentsWorkspacePage() {
  const { can } = useAuth();
  const canCreate = can(MODULES.DOCUMENTS, ACTIONS.CREATE);
  const canUpdate = can(MODULES.DOCUMENTS, ACTIONS.UPDATE);
  const canApprove = can(MODULES.DOCUMENTS, ACTIONS.APPROVE);
  const canReject = canApprove || can(MODULES.DOCUMENTS, ACTIONS.REJECT);
  const [selectedProjectId] = useWorkingProjectFilter();

  const [tab, setTab] = useState('docs');
  const [projects, setProjects] = useState([]);
  const [data, setData] = useState({ docs: [], drawings: [], rfis: [], submittals: [], transmittals: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bannerError, setBannerError] = useState('');

  const [docModal, setDocModal] = useState(false);
  const [docForm, setDocForm] = useState({ title: '', project: '', folder: 'General', category: 'other', visibility: 'internal', file: null });
  const [drawingModal, setDrawingModal] = useState(false);
  const [drwForm, setDrwForm] = useState({ title: '', project: '', discipline: 'structural', revCode: 'R0', notes: '' });
  const [revModal, setRevModal] = useState({ open: false, drawing: null, revCode: 'R1', notes: '' });
  const [rfiModal, setRfiModal] = useState(false);
  const [rfiForm, setRfiForm] = useState({ project: '', subject: '', question: '', priority: 'medium' });
  const [rfiReplyModal, setRfiReplyModal] = useState({ open: false, rfi: null, response: '', status: 'answered' });
  const [subModal, setSubModal] = useState(false);
  const [subForm, setSubForm] = useState({ project: '', type: 'material', title: '', specificationRef: '', remarks: '' });
  const [trnModal, setTrnModal] = useState(false);
  const [trnForm, setTrnForm] = useState({ project: '', recipientType: 'client', recipientName: '', subject: '', remarks: '' });

  useEffect(() => {
    projectsService.list({ limit: 100 }).then(({ data: p }) => setProjects(p || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = selectedProjectId ? { project: selectedProjectId } : {};
    try {
      const [docs, drws, rfis, subs, trns] = await Promise.all([
        erpService.documents.list(params),
        erpService.documents.listDrawings(params),
        erpService.documents.listRfis(params),
        erpService.documents.listSubmittals(params),
        erpService.documents.listTransmittals(params),
      ]);
      setData({
        docs: docs.data || [],
        drawings: drws.data || [],
        rfis: rfis.data || [],
        submittals: subs.data || [],
        transmittals: trns.data || [],
      });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveDoc = async (e) => {
    e.preventDefault();
    if (docForm.file) {
      const fd = new FormData();
      fd.append('file', docForm.file);
      fd.append('title', docForm.title);
      if (docForm.project || selectedProjectId) fd.append('project', docForm.project || selectedProjectId);
      fd.append('folder', docForm.folder);
      fd.append('category', docForm.category);
      fd.append('visibility', docForm.visibility);
      await erpService.documents.uploadFile(fd);
    } else {
      await erpService.documents.create({
        title: docForm.title,
        project: docForm.project || selectedProjectId || null,
        folder: docForm.folder,
        category: docForm.category,
        visibility: docForm.visibility,
      });
    }
    setDocModal(false);
    load();
  };

  const handleCreateDrawing = async (e) => {
    e.preventDefault();
    await erpService.documents.createDrawing({ ...drwForm, project: drwForm.project || selectedProjectId });
    setDrawingModal(false);
    load();
  };

  const handleCreateRfi = async (e) => {
    e.preventDefault();
    await erpService.documents.createRfi({ ...rfiForm, project: rfiForm.project || selectedProjectId });
    setRfiModal(false);
    load();
  };

  const runAction = async (fn) => {
    setBannerError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setBannerError(err?.response?.data?.message || err?.message || 'Operation failed');
    }
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Documents & Drawing Management"
        description="Project folders, versioned files, controlled drawing revisions, RFIs, submittals, and transmittals."
        actions={
          canCreate && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" leftIcon={Send} onClick={() => setTrnModal(true)}>Transmittal</Button>
              <Button size="sm" variant="secondary" leftIcon={FileText} onClick={() => setSubModal(true)}>Submittal</Button>
              <Button size="sm" variant="secondary" leftIcon={MessageSquarePlus} onClick={() => setRfiModal(true)}>Raise RFI</Button>
              <Button size="sm" variant="secondary" leftIcon={GitCommit} onClick={() => setDrawingModal(true)}>New Drawing</Button>
              <Button size="sm" leftIcon={Upload} onClick={() => setDocModal(true)}>Add Document</Button>
            </div>
          )
        }
      />

      {bannerError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{bannerError}</div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-line pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === t.key ? 'bg-navy-900 text-white' : 'text-muted hover:bg-canvas'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'docs' && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.docs.length === 0 ? (
            <Card className="md:col-span-2 lg:col-span-3"><CardBody className="py-8 text-center text-xs text-muted">No documents uploaded yet. Use &ldquo;Add Document&rdquo; to upload or register files.</CardBody></Card>
          ) : data.docs.map((d) => (
            <Card key={d.id}>
              <CardBody className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold">{d.documentNumber}</span>
                  <Badge tone="info">v{d.currentVersion}</Badge>
                </div>
                <p className="text-sm font-medium text-ink">{d.title}</p>
                <p className="text-muted">{d.folder} · {d.category} · Visibility: {d.visibility}</p>
                <div className="flex justify-between pt-2">
                  <StatusBadge status={d.status} />
                  {d.hasStoredFile && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        const res = await erpService.documents.getDownloadUrl(d.id);
                        window.open(res.data.url, '_blank', 'noopener');
                      }}
                    >
                      Download
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'drawings' && (
        <div className="space-y-3">
          {data.drawings.length === 0 ? (
            <Card><CardBody className="py-8 text-center text-xs text-muted">No controlled drawings registered yet.</CardBody></Card>
          ) : data.drawings.map((drw) => (
            <Card key={drw.id}>
              <CardHeader
                title={`${drw.drawingNumber} · ${drw.title}`}
                description={`${drw.discipline.toUpperCase()} · Current Rev: ${drw.currentRevisionCode}`}
                actions={canCreate && (
                  <Button size="sm" variant="secondary" leftIcon={Plus} onClick={() => setRevModal({ open: true, drawing: drw, revCode: `R${drw.revisions?.length || 1}`, notes: '' })}>New Revision</Button>
                )}
              />
              <CardBody className="space-y-2">
                {drw.revisions.map((rev) => (
                  <div key={rev._id} className="flex items-center justify-between rounded border border-line px-3 py-2 text-xs">
                    <div>
                      <span className="font-mono font-semibold text-ink">{rev.revCode}</span> · {rev.notes || 'Standard revision'}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={rev.status} />
                      {canApprove && ['draft', 'submitted'].includes(rev.status) && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon={CheckCircle2}
                            onClick={() => runAction(() => erpService.documents.reviewRevision(drw.id, rev._id, { status: 'approved' }))}
                          >
                            Approve
                          </Button>
                          {canReject && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => runAction(() => erpService.documents.reviewRevision(drw.id, rev._id, { status: 'rejected' }))}
                            >
                              Reject
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'rfis' && (
        <div className="space-y-3">
          {data.rfis.length === 0 ? (
            <Card><CardBody className="py-8 text-center text-xs text-muted">No RFIs raised yet.</CardBody></Card>
          ) : data.rfis.map((r) => (
            <Card key={r.id}>
              <CardBody className="flex flex-wrap items-start justify-between gap-4 text-xs">
                <div>
                  <span className="font-mono font-semibold">{r.rfiNumber}</span>
                  <p className="text-sm font-medium text-ink">{r.subject}</p>
                  <p className="text-muted">{r.question}</p>
                  {r.response && <p className="mt-1 rounded bg-canvas p-2 text-ink">Response: {r.response}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  {canUpdate && r.status !== 'closed' && (
                    <Button size="sm" variant="secondary" onClick={() => setRfiReplyModal({ open: true, rfi: r, response: r.response || '', status: r.status === 'answered' ? 'closed' : 'answered' })}>
                      {r.status === 'open' ? 'Answer' : 'Close'}
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === 'submittals' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader title="Technical & Material Submittals" icon={FileText} />
            <CardBody className="space-y-2 text-xs">
              {data.submittals.length === 0 ? (
                <p className="py-4 text-center text-muted">No submittals logged yet.</p>
              ) : data.submittals.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line p-2.5">
                  <div>
                    <p className="font-semibold text-ink">{s.submittalNumber} · {s.title}</p>
                    <p className="text-muted">{s.type}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={s.status} />
                    {s.status === 'draft' && canCreate && (
                      <Button size="sm" variant="secondary" onClick={() => runAction(() => erpService.documents.transitionSubmittal(s.id, { status: 'submitted' }))}>Submit</Button>
                    )}
                    {s.status === 'submitted' && canApprove && (
                      <Button size="sm" leftIcon={CheckCircle2} onClick={() => runAction(() => erpService.documents.transitionSubmittal(s.id, { status: 'approved' }))}>Approve</Button>
                    )}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Document Transmittals" icon={Send} />
            <CardBody className="space-y-2 text-xs">
              {data.transmittals.length === 0 ? (
                <p className="py-4 text-center text-muted">No transmittals sent yet.</p>
              ) : data.transmittals.map((t) => (
                <div key={t.id} className="rounded border border-line p-2.5">
                  <p className="font-semibold text-ink">{t.transmittalNumber} · {t.subject}</p>
                  <p className="text-muted">To: {t.recipientName} ({t.recipientType}) · {formatDate(t.sentAt)}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      )}

      {docModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg">
            <form onSubmit={handleSaveDoc}>
              <CardHeader title="Upload / Register Project Document" />
              <CardBody className="space-y-3">
                <Input required placeholder="Document title *" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} />
                <Select value={docForm.project || selectedProjectId} onChange={(e) => setDocForm({ ...docForm, project: e.target.value })} placeholder="Company-wide or select project…" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="Folder" value={docForm.folder} onChange={(e) => setDocForm({ ...docForm, folder: e.target.value })} />
                  <Select value={docForm.category} onChange={(e) => setDocForm({ ...docForm, category: e.target.value })} options={['drawing', 'contract', 'permit', 'specification', 'report', 'photo', 'other'].map((c) => ({ value: c, label: c }))} />
                  <Select value={docForm.visibility} onChange={(e) => setDocForm({ ...docForm, visibility: e.target.value })} options={['internal', 'contractor', 'client', 'all'].map((v) => ({ value: v, label: v }))} />
                </div>
                <input type="file" onChange={(e) => setDocForm({ ...docForm, file: e.target.files?.[0] || null })} className="text-xs" />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setDocModal(false)}>Cancel</Button>
                <Button type="submit">Save Document</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {drawingModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={handleCreateDrawing}>
              <CardHeader title="Register Controlled Drawing" />
              <CardBody className="space-y-3">
                <Input required placeholder="Drawing title *" value={drwForm.title} onChange={(e) => setDrwForm({ ...drwForm, title: e.target.value })} />
                <Select required value={drwForm.project || selectedProjectId} onChange={(e) => setDrwForm({ ...drwForm, project: e.target.value })} placeholder="Select Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={drwForm.discipline} onChange={(e) => setDrwForm({ ...drwForm, discipline: e.target.value })} options={['architectural', 'structural', 'mep', 'civil', 'landscape'].map((d) => ({ value: d, label: d }))} />
                  <Input placeholder="Initial Rev (e.g. R0)" value={drwForm.revCode} onChange={(e) => setDrwForm({ ...drwForm, revCode: e.target.value })} />
                </div>
                <Textarea rows={2} placeholder="Revision notes" value={drwForm.notes} onChange={(e) => setDrwForm({ ...drwForm, notes: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setDrawingModal(false)}>Cancel</Button>
                <Button type="submit">Register Drawing</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {rfiModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={handleCreateRfi}>
              <CardHeader title="Raise Request for Information (RFI)" />
              <CardBody className="space-y-3">
                <Select required value={rfiForm.project || selectedProjectId} onChange={(e) => setRfiForm({ ...rfiForm, project: e.target.value })} placeholder="Select Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Input required placeholder="Subject *" value={rfiForm.subject} onChange={(e) => setRfiForm({ ...rfiForm, subject: e.target.value })} />
                <Textarea required rows={3} placeholder="Technical query *" value={rfiForm.question} onChange={(e) => setRfiForm({ ...rfiForm, question: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setRfiModal(false)}>Cancel</Button>
                <Button type="submit">Submit RFI</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {revModal.open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
                await erpService.documents.addRevision(revModal.drawing.id, { revCode: revModal.revCode, notes: revModal.notes });
                setRevModal({ open: false, drawing: null, revCode: 'R1', notes: '' });
              });
            }}>
              <CardHeader title={`Add Drawing Revision · ${revModal.drawing?.drawingNumber}`} />
              <CardBody className="space-y-3">
                <Input required placeholder="Revision Code (e.g. R1) *" value={revModal.revCode} onChange={(e) => setRevModal((p) => ({ ...p, revCode: e.target.value }))} />
                <Textarea rows={2} placeholder="Revision change notes" value={revModal.notes} onChange={(e) => setRevModal((p) => ({ ...p, notes: e.target.value }))} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setRevModal({ open: false, drawing: null, revCode: 'R1', notes: '' })}>Cancel</Button>
                <Button type="submit">Add Revision</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {rfiReplyModal.open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
                await erpService.documents.updateRfi(rfiReplyModal.rfi.id, { response: rfiReplyModal.response, status: rfiReplyModal.status });
                setRfiReplyModal({ open: false, rfi: null, response: '', status: 'answered' });
              });
            }}>
              <CardHeader title={`Respond to ${rfiReplyModal.rfi?.rfiNumber}`} />
              <CardBody className="space-y-3">
                <Textarea required rows={3} placeholder="Technical response *" value={rfiReplyModal.response} onChange={(e) => setRfiReplyModal((p) => ({ ...p, response: e.target.value }))} />
                <Select value={rfiReplyModal.status} onChange={(e) => setRfiReplyModal((p) => ({ ...p, status: e.target.value }))} options={[{ value: 'answered', label: 'Mark Answered' }, { value: 'closed', label: 'Close RFI' }]} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setRfiReplyModal({ open: false, rfi: null, response: '', status: 'answered' })}>Cancel</Button>
                <Button type="submit">Save Response</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {subModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
                await erpService.documents.createSubmittal({ ...subForm, project: subForm.project || selectedProjectId });
                setSubForm({ project: '', type: 'material', title: '', specificationRef: '', remarks: '' });
                setSubModal(false);
              });
            }}>
              <CardHeader title="Create Material / Technical Submittal" />
              <CardBody className="space-y-3">
                <Select required value={subForm.project || selectedProjectId} onChange={(e) => setSubForm({ ...subForm, project: e.target.value })} placeholder="Select Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <Select value={subForm.type} onChange={(e) => setSubForm({ ...subForm, type: e.target.value })} options={[{ value: 'material', label: 'Material' }, { value: 'technical', label: 'Technical' }, { value: 'shop_drawing', label: 'Shop Drawing' }, { value: 'sample', label: 'Sample' }]} />
                <Input required placeholder="Submittal Title *" value={subForm.title} onChange={(e) => setSubForm({ ...subForm, title: e.target.value })} />
                <Input placeholder="Specification Ref (e.g. IS-456)" value={subForm.specificationRef} onChange={(e) => setSubForm({ ...subForm, specificationRef: e.target.value })} />
                <Textarea rows={2} placeholder="Remarks" value={subForm.remarks} onChange={(e) => setSubForm({ ...subForm, remarks: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setSubModal(false)}>Cancel</Button>
                <Button type="submit">Create Submittal</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {trnModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <form onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
                await erpService.documents.createTransmittal({ ...trnForm, project: trnForm.project || selectedProjectId });
                setTrnForm({ project: '', recipientType: 'client', recipientName: '', subject: '', remarks: '' });
                setTrnModal(false);
              });
            }}>
              <CardHeader title="Send Document Transmittal" />
              <CardBody className="space-y-3">
                <Select required value={trnForm.project || selectedProjectId} onChange={(e) => setTrnForm({ ...trnForm, project: e.target.value })} placeholder="Select Project *" options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={trnForm.recipientType} onChange={(e) => setTrnForm({ ...trnForm, recipientType: e.target.value })} options={['client', 'consultant', 'contractor', 'authority'].map((t) => ({ value: t, label: t }))} />
                  <Input required placeholder="Recipient Name *" value={trnForm.recipientName} onChange={(e) => setTrnForm({ ...trnForm, recipientName: e.target.value })} />
                </div>
                <Input required placeholder="Transmittal Subject *" value={trnForm.subject} onChange={(e) => setTrnForm({ ...trnForm, subject: e.target.value })} />
                <Textarea rows={2} placeholder="Remarks / enclosed drawings" value={trnForm.remarks} onChange={(e) => setTrnForm({ ...trnForm, remarks: e.target.value })} />
              </CardBody>
              <CardFooter className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setTrnModal(false)}>Cancel</Button>
                <Button type="submit">Log Transmittal</Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

