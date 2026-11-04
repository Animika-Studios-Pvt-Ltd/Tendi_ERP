import { Router } from 'express';
import { ACTIONS, MODULES } from '../../config/rbac.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './projects.controller.js';
import {
  addTeamMemberSchema,
  createProjectSchema,
  listProjectsQuery,
  projectIdParams,
  teamMemberParams,
  updateProjectSchema,
  userLookupQuery,
} from './projects.validator.js';

const { CREATE, READ, UPDATE } = ACTIONS;
const can = (action) => authorize(MODULES.PROJECTS, action);

const router = Router();
router.use(authenticate);

// Declared before "/:id" so "lookup" is never parsed as a project id.
router.get('/lookup/users', can(UPDATE), validate({ query: userLookupQuery }), controller.lookupUsers);

router.get('/', can(READ), validate({ query: listProjectsQuery }), controller.list);
router.post('/', can(CREATE), validate({ body: createProjectSchema }), controller.create);
router.get('/:id', can(READ), validate({ params: projectIdParams }), controller.get);
router.patch('/:id', can(UPDATE), validate({ params: projectIdParams, body: updateProjectSchema }), controller.update);

router.get('/:id/team', can(READ), validate({ params: projectIdParams }), controller.team);
router.post('/:id/team', can(UPDATE), validate({ params: projectIdParams, body: addTeamMemberSchema }), controller.addMember);
router.delete('/:id/team/:userId', can(UPDATE), validate({ params: teamMemberParams }), controller.removeMember);

export default router;
