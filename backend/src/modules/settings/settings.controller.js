import { MODULES } from '../../config/rbac.js';
import { recordAudit } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as service from './settings.service.js';

export async function get(_req, res) {
  const settings = await service.getSettings();
  sendSuccess(res, settings);
}

export async function update(req, res) {
  const settings = await service.updateSettings(req.user, req.body);
  recordAudit(req, {
    action: 'settings.update',
    module: MODULES.SETTINGS,
    entityType: 'CompanySettings',
    entityId: settings.id,
    summary: `Updated company settings sections: ${Object.keys(req.body).join(', ')}`,
    changes: { sections: Object.keys(req.body) },
  });
  sendSuccess(res, settings, { message: 'Settings saved successfully' });
}

