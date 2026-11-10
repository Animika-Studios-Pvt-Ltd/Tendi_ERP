import { Router } from 'express';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './projects.controller.js';
import * as taskController from './tasks.controller.js';
import {
  addTeamMemberSchema,
  changeOrderParams,
  closeProjectSchema,
  createChangeOrderSchema,
  createMilestoneSchema,
  createProjectSchema,
  createRiskSchema,
  createTaskSchema,
  freezeBaselineSchema,
  listChangeOrdersQuery,
  listMilestonesQuery,
  listProjectsQuery,
  listRisksQuery,
  listTasksQuery,
  milestoneIdParams,
  projectIdParams,
  riskParams,
  taskIdParams,
  teamMemberParams,
  transitionChangeOrderSchema,
  updateChangeOrderSchema,
  updateMilestoneSchema,
  updateProjectSchema,
  updateRiskSchema,
  updateTaskSchema,
  userLookupQuery,
} from './projects.validator.js';

const { CREATE, READ, UPDATE, DELETE, APPROVE, REJECT } = ACTIONS;
const can = (action) => authorize(MODULES.PROJECTS, action);

const router = Router();
router.use(authenticate);

// Declared before "/:id" so static paths are never parsed as a project id.
router.get('/lookup/users', can(UPDATE), validate({ query: userLookupQuery }), controller.lookupUsers);

/* Tasks */
router.get('/tasks', can(READ), validate({ query: listTasksQuery }), taskController.listTasks);
router.post('/tasks', can(CREATE), validate({ body: createTaskSchema }), taskController.createTask);
router.get('/tasks/:id', can(READ), validate({ params: taskIdParams }), taskController.getTask);
router.patch('/tasks/:id', can(UPDATE), validate({ params: taskIdParams, body: updateTaskSchema }), taskController.updateTask);
router.delete('/tasks/:id', can(DELETE), validate({ params: taskIdParams }), taskController.deleteTask);

/* Milestones */
router.get('/milestones', can(READ), validate({ query: listMilestonesQuery }), taskController.listMilestones);
router.post('/milestones', can(CREATE), validate({ body: createMilestoneSchema }), taskController.createMilestone);
router.get('/milestones/:id', can(READ), validate({ params: milestoneIdParams }), taskController.getMilestone);
router.patch('/milestones/:id', can(UPDATE), validate({ params: milestoneIdParams, body: updateMilestoneSchema }), taskController.updateMilestone);
router.delete('/milestones/:id', can(DELETE), validate({ params: milestoneIdParams }), taskController.deleteMilestone);

/* Projects */
router.get('/', can(READ), validate({ query: listProjectsQuery }), controller.list);
router.post('/', can(CREATE), validate({ body: createProjectSchema }), controller.create);
router.get('/:id', can(READ), validate({ params: projectIdParams }), controller.get);
router.patch('/:id', can(UPDATE), validate({ params: projectIdParams, body: updateProjectSchema }), controller.update);

router.get('/:id/team', can(READ), validate({ params: projectIdParams }), controller.team);
router.post('/:id/team', can(UPDATE), validate({ params: projectIdParams, body: addTeamMemberSchema }), controller.addMember);
router.delete('/:id/team/:userId', can(UPDATE), validate({ params: teamMemberParams }), controller.removeMember);

/* WBS & Gantt */
router.get('/:id/wbs', can(READ), validate({ params: projectIdParams }), taskController.getWbs);
router.get('/:id/gantt', can(READ), validate({ params: projectIdParams }), taskController.getGantt);

/* Baseline & Closure */
router.post('/:id/baseline', can(UPDATE), validate({ params: projectIdParams, body: freezeBaselineSchema }), controller.freezeBaseline);
router.get('/:id/readiness', can(READ), validate({ params: projectIdParams }), controller.getReadiness);
router.post('/:id/close', can(UPDATE), validate({ params: projectIdParams, body: closeProjectSchema }), controller.closeProject);

/* Risk Register */
router.get('/:id/risks', can(READ), validate({ params: projectIdParams, query: listRisksQuery }), controller.listRisks);
router.post('/:id/risks', can(CREATE), validate({ params: projectIdParams, body: createRiskSchema }), controller.createRisk);
router.patch('/:id/risks/:riskId', can(UPDATE), validate({ params: riskParams, body: updateRiskSchema }), controller.updateRisk);
router.delete('/:id/risks/:riskId', can(DELETE), validate({ params: riskParams }), controller.deleteRisk);

/* Change Orders & Variation Orders */
router.get('/:id/change-orders', can(READ), validate({ params: projectIdParams, query: listChangeOrdersQuery }), controller.listChangeOrders);
router.post('/:id/change-orders', can(CREATE), validate({ params: projectIdParams, body: createChangeOrderSchema }), controller.createChangeOrder);
router.patch('/:id/change-orders/:changeId', can(UPDATE), validate({ params: changeOrderParams, body: updateChangeOrderSchema }), controller.updateChangeOrder);
router.post(
  '/:id/change-orders/:changeId/transition',
  authorize(MODULES.PROJECTS, CREATE, UPDATE, APPROVE, REJECT),
  validate({ params: changeOrderParams, body: transitionChangeOrderSchema }),
  controller.transitionChangeOrder,
);

export default router;
