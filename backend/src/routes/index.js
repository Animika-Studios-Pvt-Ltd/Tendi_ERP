import { Router } from 'express';
import { requireDatabase } from '../middleware/common.js';
import authRoutes from '../modules/auth/auth.routes.js';
import contractorsRoutes from '../modules/contractors/contractors.routes.js';
import crmRoutes from '../modules/crm/crm.routes.js';
import dashboardRoutes from '../modules/dashboard/dashboard.routes.js';
import documentsRoutes from '../modules/documents/documents.routes.js';
import equipmentRoutes from '../modules/equipment/equipment.routes.js';
import estimationRoutes from '../modules/estimation/estimation.routes.js';
import financeRoutes from '../modules/finance/finance.routes.js';
import healthRoutes, { readinessHandler } from '../modules/health/health.routes.js';
import hrRoutes from '../modules/hr/hr.routes.js';
import inventoryRoutes from '../modules/inventory/inventory.routes.js';
import legalRoutes from '../modules/legal/legal.routes.js';
import notificationsRoutes from '../modules/notifications/notifications.routes.js';
import procurementRoutes from '../modules/procurement/procurement.routes.js';
import projectRoutes from '../modules/projects/projects.routes.js';
import qualitySafetyRoutes from '../modules/qualitySafety/qualitySafety.routes.js';
import reportsRoutes from '../modules/reports/reports.routes.js';
import roleRoutes from '../modules/roles/roles.routes.js';
import searchRoutes from '../modules/search/search.routes.js';
import settingsRoutes from '../modules/settings/settings.routes.js';
import sitesRoutes from '../modules/sites/sites.routes.js';
import userRoutes from '../modules/users/users.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.get('/ready', readinessHandler);

// Everything below needs MongoDB.
router.use(requireDatabase);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/settings', settingsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/search', searchRoutes);

/*
 * Business modules are mounted here as they are built, each protected with
 * authenticate + authorize(<module>, <action>) inside its own router.
 */
router.use('/dashboard', dashboardRoutes);
router.use('/projects', projectRoutes);
router.use('/estimation', estimationRoutes);
router.use('/sites', sitesRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/procurement', procurementRoutes);
router.use('/finance', financeRoutes);
router.use('/contractors', contractorsRoutes);
router.use('/hr', hrRoutes);
router.use('/equipment', equipmentRoutes);
router.use('/quality-safety', qualitySafetyRoutes);
router.use('/documents', documentsRoutes);
router.use('/legal', legalRoutes);
router.use('/crm', crmRoutes);
router.use('/reports', reportsRoutes);

export default router;
