import { Router } from 'express';
import { MODULES } from '../../config/rbac.js';
import { authenticate } from '../../middleware/auth.js';
import { Client } from '../../models/Crm.js';
import { Contractor } from '../../models/Contractor.js';
import { DailyProgressReport } from '../../models/DailyProgressReport.js';
import { Document } from '../../models/Document.js';
import { Drawing } from '../../models/Drawing.js';
import { Equipment } from '../../models/Equipment.js';
import { Estimate } from '../../models/Estimate.js';
import { Employee } from '../../models/Hr.js';
import { NonConformanceReport } from '../../models/QualitySafety.js';
import { Material } from '../../models/Material.js';
import { MaterialRequest } from '../../models/MaterialRequest.js';
import { Project } from '../../models/Project.js';
import { PurchaseOrder } from '../../models/PurchaseOrder.js';
import { Site } from '../../models/Site.js';
import { Task } from '../../models/Task.js';
import { Tender } from '../../models/Tender.js';
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

  if (canUser(user, MODULES.ESTIMATION)) {
    const estScope =
      user.role?.dataScope === 'all'
        ? {}
        : { $or: [{ project: { $in: user.assignedProjects ?? [] } }, { project: null }] };
    queries.push(
      searchCollection(
        Estimate,
        { $and: [estScope, { $or: [{ estimateNumber: rx }, { title: rx }, { enquiryCode: rx }, { 'client.name': rx }] }] },
        'estimateNumber title status quotedTotal',
        (e) => ({
          type: 'Estimate',
          module: MODULES.ESTIMATION,
          id: String(e._id),
          code: e.estimateNumber,
          title: e.title,
          subtitle: `${e.estimateNumber} · ${e.status}`,
          link: `/estimation/${e._id}`,
        }),
      ),
      searchCollection(
        Tender,
        { $and: [estScope, { $or: [{ tenderNumber: rx }, { title: rx }] }] },
        'tenderNumber title status',
        (t) => ({
          type: 'Tender',
          module: MODULES.ESTIMATION,
          id: String(t._id),
          code: t.tenderNumber,
          title: t.title,
          subtitle: `${t.tenderNumber} · ${t.status}`,
          link: '/estimation/tenders',
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

  if (canUser(user, MODULES.DOCUMENTS)) {
    queries.push(
      searchCollection(
        Document,
        { $and: [childScope, { $or: [{ documentNumber: rx }, { title: rx }, { folder: rx }] }] },
        'documentNumber title folder',
        (d) => ({ type: 'Document', module: MODULES.DOCUMENTS, id: String(d._id), code: d.documentNumber, title: d.title, subtitle: `${d.documentNumber} · ${d.folder}`, link: '/documents' }),
      ),
      searchCollection(
        Drawing,
        { $and: [childScope, { $or: [{ drawingNumber: rx }, { title: rx }] }] },
        'drawingNumber title currentRevisionCode',
        (d) => ({ type: 'Drawing', module: MODULES.DOCUMENTS, id: String(d._id), code: d.drawingNumber, title: d.title, subtitle: `${d.drawingNumber} · ${d.currentRevisionCode}`, link: '/documents' }),
      ),
    );
  }

  if (canUser(user, MODULES.CONTRACTORS)) {
    queries.push(
      searchCollection(
        Contractor,
        { $or: [{ code: rx }, { companyName: rx }] },
        'code companyName',
        (c) => ({ type: 'Contractor', module: MODULES.CONTRACTORS, id: String(c._id), code: c.code, title: c.companyName, subtitle: c.code, link: '/contractors' }),
      ),
    );
  }

  if (canUser(user, MODULES.CRM)) {
    queries.push(
      searchCollection(
        Client,
        { $or: [{ code: rx }, { name: rx }] },
        'code name city',
        (c) => ({ type: 'Client', module: MODULES.CRM, id: String(c._id), code: c.code, title: c.name, subtitle: `${c.code} · ${c.city}`, link: '/crm' }),
      ),
    );
  }

  if (canUser(user, MODULES.EQUIPMENT)) {
    queries.push(
      searchCollection(
        Equipment,
        { $or: [{ code: rx }, { name: rx }] },
        'code name status',
        (e) => ({ type: 'Equipment', module: MODULES.EQUIPMENT, id: String(e._id), code: e.code, title: e.name, subtitle: `${e.code} · ${e.status}`, link: '/equipment' }),
      ),
    );
  }

  if (canUser(user, MODULES.HR)) {
    queries.push(
      searchCollection(
        Employee,
        { $or: [{ empCode: rx }, { fullName: rx }] },
        'empCode fullName workerCategory',
        (e) => ({ type: 'Worker', module: MODULES.HR, id: String(e._id), code: e.empCode, title: e.fullName, subtitle: `${e.empCode} · ${e.workerCategory}`, link: '/hr' }),
      ),
    );
  }

  if (canUser(user, MODULES.QUALITY_SAFETY)) {
    queries.push(
      searchCollection(
        NonConformanceReport,
        { $and: [childScope, { $or: [{ ncrNumber: rx }, { title: rx }] }] },
        'ncrNumber title severity status',
        (n) => ({ type: 'NCR', module: MODULES.QUALITY_SAFETY, id: String(n._id), code: n.ncrNumber, title: n.title, subtitle: `${n.ncrNumber} · ${n.severity}`, link: '/quality-safety' }),
      ),
    );
  }

  const results = (await Promise.all(queries)).flat().slice(0, 15);
  return sendSuccess(res, results);
});

export default router;
