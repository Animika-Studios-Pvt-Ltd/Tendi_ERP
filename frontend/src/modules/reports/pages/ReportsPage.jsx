import { BarChart3, Download, Printer } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import PageLoader from '@/components/common/PageLoader';
import Button from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { useWorkingProjectFilter } from '@/hooks/useWorkingProjectFilter';
import { erpService } from '@/services/erp.service';

export default function ReportsPage() {
  const [selectedProjectId] = useWorkingProjectFilter();
  const [catalog, setCatalog] = useState([]);
  const [activeKey, setActiveKey] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    erpService.reports
      .getCatalog()
      .then(({ data }) => {
        const list = data || [];
        setCatalog(list);
        if (list.length > 0) setActiveKey(list[0].key);
        else setLoading(false);
      })
      .catch((err) => {
        setError(err);
        setLoading(false);
      });
  }, []);

  const loadReport = useCallback(async () => {
    if (!activeKey) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await erpService.reports.getReport(
        activeKey,
        selectedProjectId ? { project: selectedProjectId } : {},
      );
      setReport(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [activeKey, selectedProjectId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleDownloadCsv = async () => {
    if (!activeKey) return;
    const blob = await erpService.reports.exportCsv(
      activeKey,
      selectedProjectId ? { project: selectedProjectId } : {},
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports & Insights"
        description="Live operational, financial, supply-chain, HR, safety, and compliance reports with safe CSV export."
        actions={
          report && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" leftIcon={Printer} onClick={() => window.print()}>
                Print / PDF
              </Button>
              <Button size="sm" leftIcon={Download} onClick={handleDownloadCsv}>
                Export CSV
              </Button>
            </div>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardHeader title="Report Library" icon={BarChart3} />
          <CardBody className="space-y-1.5">
            {catalog.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setActiveKey(r.key)}
                className={`w-full rounded-md px-3 py-2 text-left text-xs transition-colors ${
                  activeKey === r.key ? 'bg-navy-900 font-semibold text-white' : 'hover:bg-canvas text-ink'
                }`}
              >
                <p>{r.title}</p>
                <p className={`text-[10px] ${activeKey === r.key ? 'text-navy-200' : 'text-muted'}`}>{r.category}</p>
              </button>
            ))}
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          {loading ? (
            <CardBody><PageLoader /></CardBody>
          ) : error ? (
            <CardBody><ErrorState error={error} onRetry={loadReport} /></CardBody>
          ) : report ? (
            <>
              <CardHeader title={report.spec.title} description={`${report.rows.length} record(s) matched`} />
              <CardBody className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-line bg-canvas text-muted">
                      <tr>
                        {report.columns.map((c) => (
                          <th key={c.key} className="px-4 py-2.5">{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {report.rows.length === 0 ? (
                        <tr>
                          <td colSpan={report.columns.length} className="px-4 py-8 text-center text-muted">
                            No rows matched current filters.
                          </td>
                        </tr>
                      ) : (
                        report.rows.map((row) => (
                          <tr key={row.id}>
                            {report.columns.map((c) => (
                              <td key={c.key} className="px-4 py-2">{String(row[c.key] ?? '—')}</td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

