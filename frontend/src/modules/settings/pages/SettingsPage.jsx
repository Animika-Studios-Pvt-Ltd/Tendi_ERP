import { Building2, Check, FileDigit, Layers, Plus, Save, ShieldCheck, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import FormField from '@/components/forms/FormField';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { ACTIONS, MODULES } from '@/constants/permissions';
import { useAuth } from '@/hooks/useAuth';
import { settingsService } from '@/services/settings.service';
import { formatCurrencyCompact } from '@/utils/format';

const TABS = [
  { key: 'profile', label: 'Company Profile', icon: Building2 },
  { key: 'numbering', label: 'Document Numbering', icon: FileDigit },
  { key: 'approvals', label: 'Approval Limits', icon: ShieldCheck },
  { key: 'master', label: 'Master Data', icon: Layers },
];

const SERIES_LABELS = {
  project: 'Projects',
  site: 'Construction Sites',
  dpr: 'Daily Progress Reports (DPR)',
  materialRequest: 'Material Requests (MR)',
  purchaseOrder: 'Purchase Orders (PO)',
  goodsReceipt: 'Goods Receipt Notes (GRN)',
  expense: 'Site Expenses',
  invoice: 'Invoices & Billing',
};

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 4, label: 'April (Indian FY)' },
  { value: 7, label: 'July' },
  { value: 10, label: 'October' },
];

export default function SettingsPage() {
  const { can } = useAuth();
  const canUpdate = can(MODULES.SETTINGS, ACTIONS.UPDATE);

  const [activeTab, setActiveTab] = useState('profile');
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);

  // Master data quick-add inputs
  const [newUnit, setNewUnit] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newCostHead, setNewCostHead] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await settingsService.get();
      setSettings(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateProfileField = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      companyProfile: { ...prev.companyProfile, [field]: value },
    }));
    setSavedBanner(false);
  };

  const updatePreferenceField = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      preferences: { ...prev.preferences, [field]: value },
    }));
    setSavedBanner(false);
  };

  const updateSeriesField = (seriesKey, field, value) => {
    setSettings((prev) => ({
      ...prev,
      numberingSeries: {
        ...prev.numberingSeries,
        [seriesKey]: { ...prev.numberingSeries[seriesKey], [field]: value },
      },
    }));
    setSavedBanner(false);
  };

  const updateApprovalLimit = (idx, field, value) => {
    setSettings((prev) => ({
      ...prev,
      approvalLimits: prev.approvalLimits.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item,
      ),
    }));
    setSavedBanner(false);
  };

  const addMasterItem = (listKey, value, clearFn) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSettings((prev) => {
      const current = prev.masterData[listKey] || [];
      if (current.includes(trimmed)) return prev;
      return {
        ...prev,
        masterData: { ...prev.masterData, [listKey]: [...current, trimmed] },
      };
    });
    clearFn('');
    setSavedBanner(false);
  };

  const removeMasterItem = (listKey, itemToRemove) => {
    setSettings((prev) => ({
      ...prev,
      masterData: {
        ...prev.masterData,
        [listKey]: (prev.masterData[listKey] || []).filter((item) => item !== itemToRemove),
      },
    }));
    setSavedBanner(false);
  };

  const handleSave = async () => {
    if (!canUpdate || !settings) return;
    setSaving(true);
    setSavedBanner(false);
    try {
      const { data } = await settingsService.update({
        companyProfile: settings.companyProfile,
        preferences: settings.preferences,
        numberingSeries: settings.numberingSeries,
        approvalLimits: settings.approvalLimits,
        masterData: settings.masterData,
      });
      setSettings(data);
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 3000);
    } catch (err) {
      alert(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader message="Loading system settings…" />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!settings) return null;

  const saveActions = canUpdate && (
    <div className="flex items-center gap-3">
      {savedBanner && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-success-600">
          <Check className="h-4 w-4" /> Changes saved
        </span>
      )}
      <Button leftIcon={Save} loading={saving} onClick={handleSave}>
        Save settings
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Company Settings"
        description="Configure organization details, document numbering sequences, approval thresholds and master lists."
        actions={saveActions}
      />

      {/* Tabs Navigation */}
      <div className="mb-6 flex flex-wrap gap-2 border-b border-line pb-3">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors ${
                active
                  ? 'bg-navy-900 text-white shadow-sm'
                  : 'bg-surface text-muted hover:bg-navy-50 hover:text-ink border border-line'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: COMPANY PROFILE */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader title="Organization Identity & Tax Registration" />
              <CardBody className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Display Company Name" required>
                    <Input
                      value={settings.companyProfile.name || ''}
                      onChange={(e) => updateProfileField('name', e.target.value)}
                      disabled={!canUpdate}
                    />
                  </FormField>
                  <FormField label="Registered Legal Name">
                    <Input
                      value={settings.companyProfile.legalName || ''}
                      onChange={(e) => updateProfileField('legalName', e.target.value)}
                      disabled={!canUpdate}
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="GSTIN">
                    <Input
                      value={settings.companyProfile.gstin || ''}
                      onChange={(e) => updateProfileField('gstin', e.target.value.toUpperCase())}
                      placeholder="e.g. 29AABCU9603R1ZM"
                      className="font-mono uppercase"
                      disabled={!canUpdate}
                    />
                  </FormField>
                  <FormField label="PAN">
                    <Input
                      value={settings.companyProfile.pan || ''}
                      onChange={(e) => updateProfileField('pan', e.target.value.toUpperCase())}
                      placeholder="e.g. AABCU9603R"
                      className="font-mono uppercase"
                      disabled={!canUpdate}
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField label="Official Email">
                    <Input
                      type="email"
                      value={settings.companyProfile.email || ''}
                      onChange={(e) => updateProfileField('email', e.target.value)}
                      disabled={!canUpdate}
                    />
                  </FormField>
                  <FormField label="Contact Phone">
                    <Input
                      value={settings.companyProfile.phone || ''}
                      onChange={(e) => updateProfileField('phone', e.target.value)}
                      disabled={!canUpdate}
                    />
                  </FormField>
                  <FormField label="Website">
                    <Input
                      value={settings.companyProfile.website || ''}
                      onChange={(e) => updateProfileField('website', e.target.value)}
                      disabled={!canUpdate}
                    />
                  </FormField>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Headquarters Address" />
              <CardBody className="space-y-4">
                <FormField label="Street Address">
                  <Input
                    value={settings.companyProfile.address || ''}
                    onChange={(e) => updateProfileField('address', e.target.value)}
                    disabled={!canUpdate}
                  />
                </FormField>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField label="City">
                    <Input
                      value={settings.companyProfile.city || ''}
                      onChange={(e) => updateProfileField('city', e.target.value)}
                      disabled={!canUpdate}
                    />
                  </FormField>
                  <FormField label="State">
                    <Input
                      value={settings.companyProfile.state || ''}
                      onChange={(e) => updateProfileField('state', e.target.value)}
                      disabled={!canUpdate}
                    />
                  </FormField>
                  <FormField label="PIN Code">
                    <Input
                      value={settings.companyProfile.pincode || ''}
                      onChange={(e) => updateProfileField('pincode', e.target.value)}
                      disabled={!canUpdate}
                    />
                  </FormField>
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader title="Regional & Accounting Preferences" />
              <CardBody className="space-y-4">
                <FormField label="Base Currency">
                  <Select
                    value={settings.preferences.currency || 'INR'}
                    onChange={(e) => updatePreferenceField('currency', e.target.value)}
                    options={[
                      { value: 'INR', label: 'INR (₹) - Indian Rupee' },
                      { value: 'USD', label: 'USD ($) - US Dollar' },
                      { value: 'AED', label: 'AED - UAE Dirham' },
                    ]}
                    disabled={!canUpdate}
                  />
                </FormField>

                <FormField label="Financial Year Start">
                  <Select
                    value={settings.preferences.financialYearStartMonth || 4}
                    onChange={(e) =>
                      updatePreferenceField('financialYearStartMonth', Number(e.target.value))
                    }
                    options={MONTH_OPTIONS}
                    disabled={!canUpdate}
                  />
                </FormField>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: DOCUMENT NUMBERING */}
      {activeTab === 'numbering' && (
        <Card>
          <CardHeader
            title="Document Numbering Series"
            description="Configure automatic prefixes and sequence padding for generated ERP documents."
          />
          <CardBody className="p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-navy-50/50 uppercase text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Document Type</th>
                  <th className="px-3 py-3 font-semibold">Prefix</th>
                  <th className="px-3 py-3 font-semibold">Next Sequence</th>
                  <th className="px-3 py-3 font-semibold">Zero Padding</th>
                  <th className="px-4 py-3 font-semibold">Format Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {Object.entries(SERIES_LABELS).map(([key, label]) => {
                  const rule = settings.numberingSeries?.[key] || {
                    prefix: key.toUpperCase(),
                    nextNumber: 1,
                    padding: 3,
                  };
                  const preview = `${rule.prefix}-${String(rule.nextNumber || 1).padStart(
                    Number(rule.padding) || 3,
                    '0',
                  )}`;
                  return (
                    <tr key={key} className="hover:bg-navy-50/30">
                      <td className="px-4 py-3 font-medium text-ink">{label}</td>
                      <td className="px-3 py-2 w-40">
                        <Input
                          size="sm"
                          value={rule.prefix}
                          onChange={(e) =>
                            updateSeriesField(key, 'prefix', e.target.value.toUpperCase())
                          }
                          className="font-mono uppercase"
                          disabled={!canUpdate}
                        />
                      </td>
                      <td className="px-3 py-2 w-32">
                        <Input
                          size="sm"
                          type="number"
                          min="1"
                          value={rule.nextNumber}
                          onChange={(e) =>
                            updateSeriesField(key, 'nextNumber', Number(e.target.value))
                          }
                          disabled={!canUpdate}
                        />
                      </td>
                      <td className="px-3 py-2 w-32">
                        <Input
                          size="sm"
                          type="number"
                          min="2"
                          max="8"
                          value={rule.padding}
                          onChange={(e) =>
                            updateSeriesField(key, 'padding', Number(e.target.value))
                          }
                          disabled={!canUpdate}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-navy-100/60 px-2 py-1 font-mono text-xs font-bold text-navy-900">
                          {preview}
                        </code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* TAB 3: APPROVAL LIMITS */}
      {activeTab === 'approvals' && (
        <Card>
          <CardHeader
            title="Role-Based Financial Approval Thresholds"
            description="Define maximum transaction limits Project Managers can approve before escalation to Company/Super Admins."
          />
          <CardBody className="p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-navy-50/50 uppercase text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Workflow / Document</th>
                  <th className="px-3 py-3 font-semibold">Project Manager Limit (INR)</th>
                  <th className="px-3 py-3 font-semibold">Current Formatted Limit</th>
                  <th className="px-4 py-3 font-semibold text-center">Escalate Above Limit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(settings.approvalLimits || []).map((limit, idx) => (
                  <tr key={limit.module} className="hover:bg-navy-50/30">
                    <td className="px-4 py-3 font-medium text-ink">{limit.label}</td>
                    <td className="px-3 py-2 w-56">
                      <Input
                        size="sm"
                        type="number"
                        min="0"
                        step="1000"
                        value={limit.pmLimit}
                        onChange={(e) => updateApprovalLimit(idx, 'pmLimit', Number(e.target.value))}
                        disabled={!canUpdate}
                      />
                    </td>
                    <td className="px-3 py-3 tabular font-semibold text-ink">
                      {formatCurrencyCompact(limit.pmLimit)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={limit.requireAdminAboveLimit}
                        onChange={(e) =>
                          updateApprovalLimit(idx, 'requireAdminAboveLimit', e.target.checked)
                        }
                        disabled={!canUpdate}
                        className="h-4 w-4 rounded border-line text-accent-600 focus:ring-accent-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* TAB 4: MASTER DATA */}
      {activeTab === 'master' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Units of Measure */}
          <Card>
            <CardHeader title="Units of Measure" description="Standard quantity units" />
            <CardBody className="space-y-4">
              {canUpdate && (
                <div className="flex gap-2">
                  <Input
                    size="sm"
                    placeholder="e.g. bundles, tons"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' &&
                      (e.preventDefault(), addMasterItem('units', newUnit, setNewUnit))
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={Plus}
                    onClick={() => addMasterItem('units', newUnit, setNewUnit)}
                  >
                    Add
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {(settings.masterData?.units || []).map((u) => (
                  <Badge key={u} tone="neutral" className="gap-1.5 py-1 pl-2.5 pr-1.5">
                    <span>{u}</span>
                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => removeMasterItem('units', u)}
                        className="rounded-full p-0.5 hover:bg-navy-200/60"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Material Categories */}
          <Card>
            <CardHeader title="Material Categories" description="Inventory & procurement grouping" />
            <CardBody className="space-y-4">
              {canUpdate && (
                <div className="flex gap-2">
                  <Input
                    size="sm"
                    placeholder="e.g. Waterproofing"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' &&
                      (e.preventDefault(),
                      addMasterItem('materialCategories', newCategory, setNewCategory))
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={Plus}
                    onClick={() => addMasterItem('materialCategories', newCategory, setNewCategory)}
                  >
                    Add
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {(settings.masterData?.materialCategories || []).map((c) => (
                  <Badge key={c} tone="neutral" className="gap-1.5 py-1 pl-2.5 pr-1.5">
                    <span>{c}</span>
                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => removeMasterItem('materialCategories', c)}
                        className="rounded-full p-0.5 hover:bg-navy-200/60"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Cost Heads */}
          <Card>
            <CardHeader title="Cost Heads" description="Budget & BOQ expense codes" />
            <CardBody className="space-y-4">
              {canUpdate && (
                <div className="flex gap-2">
                  <Input
                    size="sm"
                    placeholder="e.g. Landscaping"
                    value={newCostHead}
                    onChange={(e) => setNewCostHead(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === 'Enter' &&
                      (e.preventDefault(), addMasterItem('costHeads', newCostHead, setNewCostHead))
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={Plus}
                    onClick={() => addMasterItem('costHeads', newCostHead, setNewCostHead)}
                  >
                    Add
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {(settings.masterData?.costHeads || []).map((ch) => (
                  <Badge key={ch} tone="neutral" className="gap-1.5 py-1 pl-2.5 pr-1.5">
                    <span>{ch}</span>
                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => removeMasterItem('costHeads', ch)}
                        className="rounded-full p-0.5 hover:bg-navy-200/60"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}

