import { Router } from 'express';
import { MODULES } from '../../config/rbac.js';
import { authenticate } from '../../middleware/auth.js';
import { DailyProgressReport } from '../../models/DailyProgressReport.js';
import { Material } from '../../models/Material.js';
import { MaterialRequest } from '../../models/MaterialRequest.js';
import { Project } from '../../models/Project.js';
import { PurchaseOrder } from '../../models/PurchaseOrder.js';
import { Site } from '../../models/Site.js';
import { Task } from '../../models/Task.js';
import { User } from '../../models/User.js';
import { Vendor } from '../../models/Vendor.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { buildProjectScope } from '../../utils/scope.js';

const router = Router();
router.use(authenticate);

const escapeRegex = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const canUser = (user, module) =>
  typeof user?.can === 'function' ? user.can(module, 'read') : Boolean(user?.role?.can?.(module, 'read'));

async function searchCollection(model, filter, select, mapper) {
  const rows = await model.find(filter).select(select).limit(4).lean();
  return rows.map(mapper);
}

router.get('/', async (req, res) => {
  const raw = String(req.query.q || '').trim();
  if (raw.length < 2) {
    return sendSuccess(res, []);
  }

  const rx = new RegExp(escapeRegex(raw.slice(0, 80)), 'i');
  const user = req.user;
  const projectScope = buildProjectScope(user, { projectField: '_id' });
  const childScope = buildProjectScope(user, { projectField: 'project' });
  const queries = [];

  if (canUser(user, MODULES.PROJECTS)) {
    queries.push(
      searchCollection(
        Project,
        { $and: [projectScope, { $or: [{ name: rx }, { code: rx }, { 'client.name': rx }] }] },
        'code name status',
        (p) => ({
          type: 'Project',
          module: MODULES.PROJECTS,
          id: String(p._id),
          code: p.code,
          title: p.name,
          subtitle: `${p.code} · ${p.status}`,
          link: `/projects/${p._id}`,
        }),
      ),
      searchCollection(
        Task,
        { $and: [childScope, { $or: [{ title: rx }, { code: rx }] }] },
        'code title status',
        (t) => ({
          type: 'Task',
          module: MODULES.PROJECTS,
          id: String(t._id),
          code: t.code,
          title: t.title,
          subtitle: `${t.code} · ${t.status}`,
          link: '/projects/tasks',
        }),
      ),
    );
  }

  if (canUser(user, MODULES.SITES)) {
    queries.push(
      searchCollection(
        Site,
        { $and: [childScope, { $or: [{ name: rx }, { code: rx }] }] },
        'code name status',
        (s) => ({
          type: 'Site',
          module: MODULES.SITES,
          id: String(s._id),
          code: s.code,
          title: s.name,
          subtitle: `${s.code} · ${s.status}`,
          link: `/sites/${s._id}`,
        }),
      ),
      searchCollection(
        DailyProgressReport,
        { $and: [childScope, { $or: [{ reportNumber: rx }, { remarks: rx }] }] },
        'reportNumber status',
        (d) => ({
          type: 'DPR',
          module: MODULES.SITES,
          id: String(d._id),
          code: d.reportNumber,
          title: d.reportNumber,
          subtitle: `DPR · ${d.status}`,
          link: `/sites/daily-progress/${d._id}`,
        }),
      ),
    );
  }

  if (canUser(user, MODULES.INVENTORY)) {
    queries.push(
      searchCollection(
        Material,
        { $or: [{ name: rx }, { code: rx }, { category: rx }] },
        'code name category',
        (m) => ({
          type: 'Material',
          module: MODULES.INVENTORY,
          id: String(m._id),
          code: m.code,
          title: m.name,
          subtitle: `${m.code} · ${m.category}`,
          link: '/inventory/materials',
        }),
      ),
    );
  }

  if (canUser(user, MODULES.PROCUREMENT)) {
    queries.push(
      searchCollection(
        Vendor,
        { $or: [{ name: rx }, { code: rx }, { gstin: rx }] },
        'code name gstin',
        (v) => ({
          type: 'Vendor',
          module: MODULES.PROCUREMENT,
          id: String(v._id),
          code: v.code,
          title: v.name,
          subtitle: `${v.code}${v.gstin ? ` · ${v.gstin}` : ''}`,
          link: '/procurement/vendors',
        }),
      ),
      searchCollection(
        MaterialRequest,
        { $and: [childScope, { $or: [{ requestNumber: rx }, { remarks: rx }] }] },
        'requestNumber status',
        (mr) => ({
          type: 'Material Request',
          module: MODULES.PROCUREMENT,
          id: String(mr._id),
          code: mr.requestNumber,
          title: mr.requestNumber,
          subtitle: `MR · ${mr.status}`,
          link: '/procurement',
        }),
      ),
      searchCollection(
        PurchaseOrder,
        { $and: [childScope, { $or: [{ poNumber: rx }] }] },
        'poNumber status grandTotal',
        (po) => ({
          type: 'Purchase Order',
          module: MODULES.PROCUREMENT,
          id: String(po._id),
          code: po.poNumber,
          title: po.poNumber,
          subtitle: `PO · ${po.status}`,
          link: '/procurement/purchase-orders',
        }),
      ),
    );
  }

  if (canUser(user, MODULES.USERS)) {
    queries.push(
      searchCollection(
        User,
        { $or: [{ firstName: rx }, { lastName: rx }, { email: rx }] },
        'firstName lastName email',
        (u) => ({
          type: 'User',
          module: MODULES.USERS,
          id: String(u._id),
          code: '',
          title: [u.firstName, u.lastName].filter(Boolean).join(' '),
          subtitle: u.email,
          link: `/users/${u._id}`,
        }),
      ),
    );
  }

  const results = (await Promise.all(queries)).flat().slice(0, 15);
  return sendSuccess(res, results);
});

export default router;
