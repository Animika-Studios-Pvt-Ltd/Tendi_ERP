import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import FormAlert from '@/components/forms/FormAlert';
import FormField from '@/components/forms/FormField';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { projectsService } from '@/services/projects.service';
import { sitesService } from '@/services/sites.service';
import { WEATHER_CONDITION_OPTIONS, WEATHER_IMPACT_OPTIONS } from '../constants';

export default function DprFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [sites, setSites] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  // Form states
  const [project, setProject] = useState(searchParams.get('project') || '');
  const [site, setSite] = useState(searchParams.get('site') || '');
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [weatherCondition, setWeatherCondition] = useState('sunny');
  const [weatherTemp, setWeatherTemp] = useState('28');
  const [weatherImpact, setWeatherImpact] = useState('none');
  const [remarks, setRemarks] = useState('');

  // Dynamic lists
  const [workDone, setWorkDone] = useState([
    { description: '', locationOrGrid: '', quantity: '0', unit: 'sq.ft', status: 'in_progress' },
  ]);
  const [labour, setLabour] = useState([
    { trade: 'Masons', headcount: '4', hoursWorked: '8', contractorName: '' },
    { trade: 'Helpers', headcount: '8', hoursWorked: '8', contractorName: '' },
  ]);
  const [materials, setMaterials] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [issues, setIssues] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setInitialLoading(true);

    Promise.all([
      projectsService.list({ limit: 100 }),
      isEdit ? sitesService.getDpr(id) : Promise.resolve(null),
    ])
      .then(([projRes, dprRes]) => {
        if (cancelled) return;
        setProjects(projRes.data);

        if (dprRes?.data) {
          const d = dprRes.data;
          setProject(d.project?.id || '');
          setSite(d.site?.id || '');
          setReportDate(d.reportDate ? d.reportDate.slice(0, 10) : '');
          setWeatherCondition(d.weather?.condition || 'sunny');
          setWeatherTemp(String(d.weather?.temperature || '28'));
          setWeatherImpact(d.weather?.weatherImpact || 'none');
          setRemarks(d.remarks || '');
          setWorkDone(d.workDone?.length ? d.workDone : []);
          setLabour(d.labourAttendance?.length ? d.labourAttendance : []);
          setMaterials(d.materialUsage?.length ? d.materialUsage : []);
          setEquipment(d.equipmentUsage?.length ? d.equipmentUsage : []);
          setIssues(d.siteIssues?.length ? d.siteIssues : []);
        }
      })
      .catch((err) => !cancelled && setInitialError(err))
      .finally(() => !cancelled && setInitialLoading(false));

    return () => {
      cancelled = true;
    };
  }, [id, isEdit]);

  // Load sites when project changes
  useEffect(() => {
    if (!project) {
      setSites([]);
      return;
    }
    sitesService
      .listSites({ project, limit: 100 })
      .then(({ data }) => setSites(data))
      .catch(() => setSites([]));
  }, [project]);

  // Work item helpers
  const addWorkRow = () => {
    setWorkDone((prev) => [
      ...prev,
      { description: '', locationOrGrid: '', quantity: '0', unit: '', status: 'in_progress' },
    ]);
  };
  const updateWorkRow = (index, field, value) => {
    setWorkDone((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };
  const removeWorkRow = (index) => setWorkDone((prev) => prev.filter((_, i) => i !== index));

  // Labour item helpers
  const addLabourRow = () => {
    setLabour((prev) => [...prev, { trade: '', headcount: '1', hoursWorked: '8', contractorName: '' }]);
  };
  const updateLabourRow = (index, field, value) => {
    setLabour((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };
  const removeLabourRow = (index) => setLabour((prev) => prev.filter((_, i) => i !== index));

  // Material helpers
  const addMaterialRow = () => {
    setMaterials((prev) => [...prev, { materialName: '', quantity: '1', unit: 'bags', notes: '' }]);
  };
  const updateMaterialRow = (index, field, value) => {
    setMaterials((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };
  const removeMaterialRow = (index) => setMaterials((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async (e, shouldSubmitForReview = false) => {
    e.preventDefault();
    setServerError(null);

    if (!project) {
      setServerError('Please select a project');
      return;
    }
    if (!site) {
      setServerError('Please select a site');
      return;
    }

    const payload = {
      project,
      site,
      reportDate,
      weather: {
        condition: weatherCondition,
        temperature: Number(weatherTemp) || 28,
        weatherImpact,
      },
      workDone: workDone.filter((w) => w.description.trim()).map((w) => ({
        ...w,
        quantity: Number(w.quantity) || 0,
      })),
      labourAttendance: labour.filter((l) => l.trade.trim()).map((l) => ({
        ...l,
        headcount: Number(l.headcount) || 0,
        hoursWorked: Number(l.hoursWorked) || 8,
      })),
      materialUsage: materials.filter((m) => m.materialName.trim()).map((m) => ({
        ...m,
        quantity: Number(m.quantity) || 0,
      })),
      equipmentUsage: equipment.filter((eq) => eq.equipmentName?.trim()).map((eq) => ({
        ...eq,
        hoursOperated: Number(eq.hoursOperated) || 0,
      })),
      siteIssues: issues.filter((iss) => iss.title?.trim()),
      remarks,
    };

    setSubmitting(true);
    try {
      if (isEdit) {
        await sitesService.updateDpr(id, payload);
        if (shouldSubmitForReview) {
          await sitesService.transitionDpr(id, { status: 'submitted' });
        }
        navigate(`/sites/daily-progress/${id}`);
      } else {
        const { data } = await sitesService.createDpr(payload);
        if (shouldSubmitForReview) {
          await sitesService.transitionDpr(data.id, { status: 'submitted' });
        }
        navigate(`/sites/daily-progress/${data.id}`);
      }
    } catch (err) {
      setServerError(err.message || 'Failed to save daily progress report');
    } finally {
      setSubmitting(false);
    }
  };

  if (initialLoading) return <PageLoader message="Loading report form…" />;
  if (initialError) return <ErrorState error={initialError} />;

  const projectOptions = [
    { value: '', label: 'Select project…' },
    ...projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` })),
  ];

  const siteOptions = [
    { value: '', label: 'Select site…' },
    ...sites.map((s) => ({ value: s.id, label: `${s.code} - ${s.name}` })),
  ];

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit Daily Progress Report' : 'Draft Daily Progress Report'}
        description="Record site activities, weather conditions, labour attendance and material consumption."
      />

      <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
        <FormAlert error={serverError} />

        {/* Header Details: Project, Site, Date & Weather */}
        <Card>
          <CardHeader title="Report Context & Environmental Conditions" />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField label="Project" required>
                <Select
                  value={project}
                  onChange={(e) => {
                    setProject(e.target.value);
                    setSite('');
                  }}
                  options={projectOptions}
                  disabled={isEdit}
                />
              </FormField>

              <FormField label="Site / Zone" required>
                <Select
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  options={siteOptions}
                  disabled={isEdit || !project}
                />
              </FormField>

              <FormField label="Report date" required>
                <Input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 border-t border-line pt-4">
              <FormField label="Weather condition">
                <Select
                  value={weatherCondition}
                  onChange={(e) => setWeatherCondition(e.target.value)}
                  options={WEATHER_CONDITION_OPTIONS}
                />
              </FormField>

              <FormField label="Temperature (°C)">
                <Input
                  type="number"
                  value={weatherTemp}
                  onChange={(e) => setWeatherTemp(e.target.value)}
                  placeholder="28"
                />
              </FormField>

              <FormField label="Impact on site progress">
                <Select
                  value={weatherImpact}
                  onChange={(e) => setWeatherImpact(e.target.value)}
                  options={WEATHER_IMPACT_OPTIONS}
                />
              </FormField>
            </div>
          </CardBody>
        </Card>

        {/* Work Executed */}
        <Card>
          <CardHeader
            title="Work Executed Today"
            description="Specific tasks and physical quantities completed"
            action={
              <Button type="button" size="sm" variant="outline" leftIcon={Plus} onClick={addWorkRow}>
                Add task
              </Button>
            }
          />
          <CardBody className="space-y-3">
            {workDone.map((row, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row items-center gap-2 border-b border-line pb-3 sm:border-0 sm:pb-0">
                <div className="flex-1 w-full sm:w-auto">
                  <Input
                    placeholder="Work description (e.g. PCC for Column Footing C1-C8)"
                    value={row.description}
                    onChange={(e) => updateWorkRow(idx, 'description', e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-36">
                  <Input
                    placeholder="Grid / Floor"
                    value={row.locationOrGrid}
                    onChange={(e) => updateWorkRow(idx, 'locationOrGrid', e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-24">
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={row.quantity}
                    onChange={(e) => updateWorkRow(idx, 'quantity', e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-24">
                  <Input
                    placeholder="Unit (m³)"
                    value={row.unit}
                    onChange={(e) => updateWorkRow(idx, 'unit', e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeWorkRow(idx)}
                  disabled={workDone.length <= 1}
                >
                  <Trash2 className="h-4 w-4 text-muted hover:text-danger-600" />
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>

        {/* Labour Attendance */}
        <Card>
          <CardHeader
            title="Labour Attendance"
            description="Headcount by trade/skill and contractor"
            action={
              <Button type="button" size="sm" variant="outline" leftIcon={Plus} onClick={addLabourRow}>
                Add trade
              </Button>
            }
          />
          <CardBody className="space-y-3">
            {labour.map((row, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row items-center gap-2 border-b border-line pb-3 sm:border-0 sm:pb-0">
                <div className="flex-1 w-full sm:w-auto">
                  <Input
                    placeholder="Trade / Skill (e.g. Masons, Helpers, Bar Benders)"
                    value={row.trade}
                    onChange={(e) => updateLabourRow(idx, 'trade', e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-28">
                  <Input
                    type="number"
                    placeholder="Headcount"
                    value={row.headcount}
                    onChange={(e) => updateLabourRow(idx, 'headcount', e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-24">
                  <Input
                    type="number"
                    placeholder="Hours"
                    value={row.hoursWorked}
                    onChange={(e) => updateLabourRow(idx, 'hoursWorked', e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-48">
                  <Input
                    placeholder="Contractor (optional)"
                    value={row.contractorName}
                    onChange={(e) => updateLabourRow(idx, 'contractorName', e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeLabourRow(idx)}
                >
                  <Trash2 className="h-4 w-4 text-muted hover:text-danger-600" />
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>

        {/* Material Consumption */}
        <Card>
          <CardHeader
            title="Material Consumption"
            description="Major materials utilized during today's shift"
            action={
              <Button type="button" size="sm" variant="outline" leftIcon={Plus} onClick={addMaterialRow}>
                Add material
              </Button>
            }
          />
          <CardBody className="space-y-3">
            {!materials.length ? (
              <p className="text-xs text-muted">No material entries added. Click &ldquo;Add material&rdquo; to record consumption.</p>
            ) : (
              materials.map((row, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row items-center gap-2">
                  <div className="flex-1 w-full sm:w-auto">
                    <Input
                      placeholder="Material (e.g. Cement PPC, 12mm TMT Steel)"
                      value={row.materialName}
                      onChange={(e) => updateMaterialRow(idx, 'materialName', e.target.value)}
                    />
                  </div>
                  <div className="w-full sm:w-28">
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={row.quantity}
                      onChange={(e) => updateMaterialRow(idx, 'quantity', e.target.value)}
                    />
                  </div>
                  <div className="w-full sm:w-28">
                    <Input
                      placeholder="Unit (bags)"
                      value={row.unit}
                      onChange={(e) => updateMaterialRow(idx, 'unit', e.target.value)}
                    />
                  </div>
                  <div className="w-full sm:w-48">
                    <Input
                      placeholder="Notes / Batch #"
                      value={row.notes}
                      onChange={(e) => updateMaterialRow(idx, 'notes', e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMaterialRow(idx)}
                  >
                    <Trash2 className="h-4 w-4 text-muted hover:text-danger-600" />
                  </Button>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        {/* Remarks */}
        <Card>
          <CardHeader title="General Remarks / Shift Summary" />
          <CardBody>
            <Textarea
              rows={3}
              placeholder="Any notable observations, delays, safety checks, or visitors on site..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </CardBody>
          <CardFooter className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/sites/daily-progress')}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="secondary"
              loading={submitting}
            >
              Save draft
            </Button>
            <Button
              type="button"
              loading={submitting}
              onClick={(e) => handleSubmit(e, true)}
            >
              Submit for PM approval
            </Button>
          </CardFooter>
        </Card>
      </form>
    </>
  );
}

