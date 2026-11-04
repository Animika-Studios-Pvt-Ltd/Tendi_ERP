/**
 * DEMO DATA. Not production data.
 * Sample values used only to design and review the dashboard layout.
 * Each block is replaced by a dashboard API aggregate as its module goes live:
 *   projects/schedule -> Project Management, costTrend -> Budget & Finance,
 *   approvals -> workflow modules, lowStock -> Inventory, attendance -> HR & Labour,
 *   safety -> Quality & Safety.
 */
export const IS_DEMO_DATA = true;

export const demoAsOf = '2026-11-04';

export const demoKpis = {
  contractValue: 3124000000,
  costToDate: 1718000000,
  budgetUsedPercent: 55,
  pendingApprovals: { total: 23, materialRequests: 9, expenses: 7, contractorBills: 4, progressReports: 3 },
  labourToday: { present: 1284, planned: 1410 },
};

export const demoProjects = [
  { code: 'LUM-2401', name: 'Skyline Residency Tower B', location: 'Pune', manager: 'Rohan Kulkarni', planned: 68, actual: 61, finish: '2027-08-30', status: 'at_risk' },
  { code: 'LUM-2403', name: 'Orchid Commercial Plaza', location: 'Hyderabad', manager: 'Sneha Reddy', planned: 45, actual: 47, finish: '2027-12-15', status: 'on_track' },
  { code: 'LUM-2405', name: 'NH-48 Service Road, Package 2', location: 'Gurugram', manager: 'Amit Choudhary', planned: 82, actual: 70, finish: '2027-02-28', status: 'delayed' },
  { code: 'LUM-2408', name: 'Greenfield School Campus', location: 'Nashik', manager: 'Priya Deshmukh', planned: 30, actual: 31, finish: '2027-06-30', status: 'on_track' },
  { code: 'LUM-2410', name: 'Riverside Villas Phase 1', location: 'Kochi', manager: 'Joseph Mathew', planned: 15, actual: 12, finish: '2028-03-31', status: 'at_risk' },
  { code: 'LUM-2411', name: 'Metro Depot Civil Works', location: 'Bengaluru', manager: 'Karthik Rao', planned: 55, actual: 54, finish: '2027-09-30', status: 'on_track' },
];

// Monthly spend in ₹ crore
export const demoCostTrend = [
  { month: 'May', planned: 22.4, actual: 21.1 },
  { month: 'Jun', planned: 24.8, actual: 26.3 },
  { month: 'Jul', planned: 26.0, actual: 27.9 },
  { month: 'Aug', planned: 25.2, actual: 24.6 },
  { month: 'Sep', planned: 27.5, actual: 29.8 },
  { month: 'Oct', planned: 28.1, actual: 30.4 },
];

export const demoApprovals = [
  { id: 'MR-0412', type: 'Material request', title: 'TMT steel Fe500D, 18 t', project: 'Skyline Residency', requestedBy: 'Arif Shaikh', amount: 1170000, waiting: '2 h', status: 'submitted' },
  { id: 'PO-0756', type: 'Purchase order', title: 'Ready-mix concrete M30, 240 m³', project: 'NH-48 Package 2', requestedBy: 'Neha Gupta', amount: 1392000, waiting: '5 h', status: 'under_review' },
  { id: 'CB-0127', type: 'Contractor bill', title: 'RA bill 4, shuttering works', project: 'Orchid Plaza', requestedBy: 'Shree Formworks', amount: 1835000, waiting: '1 d', status: 'submitted' },
  { id: 'DPR-3321', type: 'Progress report', title: 'Level 14 slab casting', project: 'Skyline Residency', requestedBy: 'Vikas Patil', amount: null, waiting: '1 d', status: 'submitted' },
  { id: 'EXP-0988', type: 'Expense', title: 'Diesel for DG set, October', project: 'Metro Depot', requestedBy: 'Manjunath S', amount: 48500, waiting: '2 d', status: 'under_review' },
];

export const demoLowStock = [
  { id: 'cement-opc53', material: 'OPC 53 cement', site: 'Skyline Residency', unit: 'bags', onHand: 420, reorderLevel: 800 },
  { id: 'tmt-12', material: 'TMT bar 12 mm', site: 'Orchid Plaza', unit: 't', onHand: 6.5, reorderLevel: 10 },
  { id: 'sand-river', material: 'River sand', site: 'Greenfield School', unit: 'm³', onHand: 38, reorderLevel: 60 },
  { id: 'agg-20', material: 'Aggregate 20 mm', site: 'NH-48 Package 2', unit: 'm³', onHand: 0, reorderLevel: 80 },
  { id: 'aac-200', material: 'AAC block 200 mm', site: 'Riverside Villas', unit: 'nos', onHand: 2200, reorderLevel: 3000 },
];

export const demoAttendance = [
  { site: 'Skyline', planned: 320, present: 296 },
  { site: 'Orchid', planned: 260, present: 248 },
  { site: 'NH-48', planned: 380, present: 322 },
  { site: 'Greenfield', planned: 140, present: 137 },
  { site: 'Riverside', planned: 90, present: 71 },
  { site: 'Metro', planned: 220, present: 210 },
];

export const demoSafety = {
  daysWithoutLostTime: 142,
  openNonConformances: 7,
  inspectionsThisWeek: 18,
  nearMissesThisMonth: 3,
};
