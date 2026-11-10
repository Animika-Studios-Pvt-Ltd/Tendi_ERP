import { useEffect, useState } from 'react';
import { DEFAULT_CATEGORIES, DEFAULT_UNITS } from '@/modules/inventory/constants';
import { settingsService } from '@/services/settings.service';

export function useMasterData() {
  const [masterData, setMasterData] = useState({
    units: DEFAULT_UNITS,
    materialCategories: DEFAULT_CATEGORIES,
    costHeads: [],
  });

  useEffect(() => {
    let cancelled = false;
    settingsService
      .getMasterData()
      .then((res) => {
        if (cancelled || !res?.data?.masterData) return;
        const md = res.data.masterData;
        setMasterData({
          units: md.units?.length ? md.units : DEFAULT_UNITS,
          materialCategories: md.materialCategories?.length ? md.materialCategories : DEFAULT_CATEGORIES,
          costHeads: md.costHeads || [],
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return masterData;
}

