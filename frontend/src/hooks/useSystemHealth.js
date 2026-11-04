import { useCallback, useEffect, useState } from 'react';
import { systemService } from '@/services/system.service';

/**
 * Polls GET /health. state: "checking" | "online" | "degraded" | "offline".
 * "degraded" means the API is up but MongoDB is not connected.
 */
export function useSystemHealth({ intervalMs = 60000 } = {}) {
  const [state, setState] = useState('checking');
  const [report, setReport] = useState(null);

  const check = useCallback(async () => {
    try {
      const { data } = await systemService.health();
      setReport(data);
      setState(data.checks.database === 'connected' ? 'online' : 'degraded');
    } catch {
      setReport(null);
      setState('offline');
    }
  }, []);

  useEffect(() => {
    check();
    const timer = setInterval(check, intervalMs);
    return () => clearInterval(timer);
  }, [check, intervalMs]);

  return { state, report, refresh: check };
}
