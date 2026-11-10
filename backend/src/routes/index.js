import { Router } from 'express';
import { requireDatabase } from '../middleware/common.js';
import authRoutes from '../modules/auth/auth.routes.js';
import healthRoutes, { readinessHandler } from '../modules/health/health.routes.js';
import projectRoutes from '../modules/projects/projects.routes.js';
import roleRoutes from '../modules/roles/roles.routes.js';
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

/*
 * Business modules are mounted here as they are built, each protected with
 * authenticate + authorize(<module>, <action>) inside its own router.
 */
router.use('/projects', projectRoutes);
router.use('/sites', sitesRoutes);

export default router;
