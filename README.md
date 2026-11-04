# Ten.Di ERP

A construction ERP covering projects, sites, inventory, procurement, finance, HR and labour, contractors, CRM, equipment, quality and safety, documents and user access. It is a MERN monorepo: a React (Vite) frontend and an Express/MongoDB backend.

**Current status: Phase 1 (foundation).** Authentication, role-based access, the application shell, the design system and the dashboard layout (demo data) are in place. Business modules are registered with routes and navigation and are built one at a time in later phases (see [Roadmap](#roadmap)).

---

## Technology stack

| Layer    | Choice |
| -------- | ------ |
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router 7, Axios, React Hook Form, Zod, Recharts, Lucide icons |
| Backend  | Node.js 20.11+, Express 5 (ESM), Mongoose 9, Zod, JWT (httpOnly cookie), bcrypt, Multer, Helmet, express-rate-limit |
| Database | MongoDB Atlas |
| Storage  | Cloudinary through a provider interface (S3 can be added without touching routes) |
| Tooling  | npm workspaces, concurrently, `node --watch` |

## Folder structure

```
Tendi_ERP/
├── package.json              # workspaces + combined dev scripts
├── frontend/                 # React app (Vite)
│   ├── index.html
│   ├── vite.config.js        # @ alias, /api proxy, vendor chunking
│   ├── public/
│   └── src/
│       ├── assets/
│       ├── components/
│       │   ├── ui/           # Button, Input, Select, Textarea, Card, Badge, Avatar, Popover, Spinner, Skeleton
│       │   ├── forms/        # FormField, PasswordInput, FormAlert
│       │   ├── tables/       # DataTable (loading/error/empty), Pagination, TableToolbar
│       │   ├── charts/       # Recharts theme + tooltip
│       │   ├── layout/       # Sidebar, Topbar, Breadcrumbs, GlobalSearch, ProjectSelector, menus
│       │   └── common/       # PageHeader, StatusBadge, EmptyState, ErrorState, ModuleWorkspace, SystemStatus…
│       ├── layouts/          # AppLayout (shell), AuthLayout (sign-in screens)
│       ├── modules/          # one folder per ERP module + registry.js
│       │   ├── registry.js   # single source for nav, routes, breadcrumbs, search
│       │   ├── dashboard/    # index.js manifest, pages/, components/, data/ (demo)
│       │   ├── projects/ sites/ inventory/ procurement/ finance/ hr/
│       │   ├── contractors/ crm/ equipment/ quality-safety/ documents/
│       │   └── reports/ users/ settings/
│       ├── pages/            # auth pages, profile, not found
│       ├── routes/           # AppRoutes, ProtectedRoute, PermissionGate
│       ├── context/          # AuthContext, ProjectContext
│       ├── hooks/            # useAuth, useProject, useLocalStorage, useClickOutside, useSystemHealth
│       ├── services/         # api.js (Axios instance), auth/system services
│       ├── constants/        # permission keys, status labels, app constants
│       ├── utils/            # cn, formatting (INR, dates), validation helpers
│       ├── App.jsx
│       └── main.jsx
└── backend/                  # Express + MongoDB API
    └── src/
        ├── config/           # env (Zod-validated), db, rbac (roles × modules × actions)
        ├── models/           # Mongoose models shared across modules + plugins/
        ├── modules/          # feature modules: <name>.routes / controller / service / validator
        │   ├── auth/
        │   └── health/
        ├── middleware/       # authenticate, authorize, validate, errorHandler, upload, rate limits
        ├── services/         # audit log, storage providers
        ├── routes/index.js   # mounts module routers under /api/v1
        ├── scripts/seed.js   # roles + first Super Admin
        ├── utils/            # ApiError, responses, pagination, project scope, tokens, logger
        ├── app.js
        └── server.js
```

**Why there are no top-level `controllers/` or `validators/` folders in `backend/src`:** each feature keeps its routes, controller, service and validator together in `modules/<name>/`, so a module can be built, reviewed and tested on its own. Models stay in `models/` because records reference each other across modules (a purchase order references a project, vendor and material request).

## Prerequisites

- Node.js 20.11 or newer (developed on Node 24) and npm 10+
- A MongoDB Atlas cluster (the free M0 tier is fine for development)
- Optional: a Cloudinary account for file uploads

## Installation

```bash
git clone <repo-url> Tendi_ERP
cd Tendi_ERP
npm install                      # installs frontend and backend through workspaces

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill in `backend/.env` (see below), then seed roles and the first admin:

```bash
npm run seed
npm run dev
```

Open http://localhost:5173 and sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `NODE_ENV` | no | `development`, `test` or `production` |
| `PORT` | no | API port, default `5000` |
| `MONGODB_URI` | **yes** | Atlas connection string |
| `MONGODB_DB_NAME` | no | Database name, e.g. `lumos_erp` |
| `CLIENT_URL` | no | Allowed browser origin(s), comma separated. The first is used in password reset links |
| `JWT_SECRET` | **yes** | At least 32 random characters. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | no | Session lifetime, default `1d` |
| `AUTH_COOKIE_NAME` | no | Session cookie name |
| `AUTH_COOKIE_SAMESITE` | no | `lax` (default). Use `none` only if client and API are on different sites; this requires HTTPS |
| `AUTH_COOKIE_SECURE` | no | Forced on in production |
| `PASSWORD_RESET_TTL_MINUTES` | no | Reset link lifetime, default 30 |
| `BCRYPT_SALT_ROUNDS` | no | 10–15, default 12 |
| `STORAGE_PROVIDER` | no | `cloudinary` (an `s3` provider can be added later) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | for uploads | Cloudinary credentials |
| `CLOUDINARY_FOLDER` | no | Root folder for uploads |
| `MAX_UPLOAD_SIZE_MB` | no | Per-file limit, default 10 |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | for seeding | First Super Admin created by `npm run seed` |

The API validates these at startup and exits with a list of problems if any are missing or malformed.

### Frontend (`frontend/.env`)

| Variable | Description |
| -------- | ----------- |
| `VITE_API_BASE_URL` | `/api/v1` in development (proxied). In production, the same path behind a reverse proxy, or the full API URL |
| `VITE_APP_NAME` | Display name |
| `VITE_DEV_API_PROXY_TARGET` | Where Vite forwards `/api` in development, default `http://localhost:5000` |
| `VITE_DEV_PORT` | Vite port, default 5173 |

Only `VITE_*` variables reach the browser. Never put secrets in the frontend `.env`.

## Database configuration (MongoDB Atlas)

1. Create a cluster in Atlas and a database user with read/write access.
2. Under **Network Access**, allow your development IP (and your server's IP in production).
3. Copy the driver connection string into `MONGODB_URI` and set `MONGODB_DB_NAME`.
4. Run `npm run seed`. It creates the 8 system roles and the first Super Admin, and is safe to re-run.

Connection behaviour:

- In development the API starts even if MongoDB is unreachable and keeps retrying with backoff.
- In production it exits after 5 failed attempts so your process manager can restart it.
- While the database is down, `GET /api/v1/health` reports `degraded`, `GET /api/v1/health/ready` returns 503, and data routes return a 503 JSON error instead of hanging.

## Running the project

| Command (from repo root) | What it does |
| ------------------------ | ------------ |
| `npm run dev` | Backend on :5000 and frontend on :5173 together |
| `npm run dev:backend` | Backend only, restarts on file changes |
| `npm run dev:frontend` | Frontend only |
| `npm run seed` | Upsert roles and create the first Super Admin |
| `npm run build` | Production build of the frontend into `frontend/dist` |
| `npm start` | Start the API in production mode (set `NODE_ENV=production`) |

On Windows you can also double-click `start-backend.bat` and `start-frontend.bat` in the project root. Each opens its own window and installs dependencies on first run. Start the backend first.

In development Vite proxies `/api` to the API, so the browser sees one origin and the httpOnly session cookie works without CORS configuration.

## API overview (Phase 1)

All responses use `{ success, data, meta?, message? }`; errors use `{ success: false, error: { code, message, details? } }`.

| Method | Path | Auth | Purpose |
| ------ | ---- | ---- | ------- |
| GET | `/api/v1/health` | – | Liveness plus database and storage status |
| GET | `/api/v1/health/ready` | – | Readiness: 503 until MongoDB is connected |
| POST | `/api/v1/auth/login` | – | Sign in and set the session cookie (rate limited, locks after 5 failed attempts) |
| POST | `/api/v1/auth/logout` | – | Clear the session |
| GET | `/api/v1/auth/me` | ✓ | Current user, role and permission map |
| PATCH | `/api/v1/auth/me` | ✓ | Update own profile |
| POST | `/api/v1/auth/change-password` | ✓ | Change password; other sessions are invalidated |
| POST | `/api/v1/auth/forgot-password` | – | Request a reset link (same response whether or not the email exists) |
| POST | `/api/v1/auth/reset-password` | – | Set a new password with a single-use token |

Email delivery is not wired up yet. In development, set `LOG_PASSWORD_RESET_LINKS=true` in `backend/.env` to print reset links in the API console (ignored outside development).

## Security model

- **Authentication:** JWT signed with `JWT_SECRET`, stored in an httpOnly, SameSite cookie (also accepted as `Authorization: Bearer` for API clients). Tokens issued before a password change are rejected.
- **Passwords:** bcrypt (12 rounds), strength rules enforced on the server, never returned by the API. Reset tokens are random 32-byte values stored only as SHA-256 hashes.
- **Authorization (RBAC):** each role grants `create / read / update / delete / approve / reject` per module (`backend/src/config/rbac.js`). Every business route must use `authenticate` and `authorize(module, action)`, so the API enforces access regardless of what the UI shows.
- **Record-level access:** each role has a data scope (`all`, `assigned` or `own`). Module services must merge `buildProjectScope(req.user)` into queries so users only see projects they are assigned to.
- **Hardening:** Helmet headers, CORS allow-list, request size limits, rate limiting, Zod validation on every input, centralised error handling that hides internals in production, and an audit log for authentication events.

### Roles

| Role | Data scope | Typical access |
| ---- | ---------- | -------------- |
| Super Admin | all | Everything, including roles and permissions |
| Company Admin | all | Everything for the company; cannot manage Super Admins |
| Project Manager | assigned | Plans projects, approves site requests, procurement and expenses |
| Site Engineer | assigned | Daily progress, material requests, expenses, attendance, site issues |
| Store / Procurement Manager | assigned | Inventory, vendors, purchase orders, goods receipts |
| Accountant / HR Manager | all | Finance, payments, HR, contractor bill verification |
| Contractor | own | Their work orders and bills |
| Customer | own | Their project progress, documents and enquiries |

## Design system

- **Colours:** navy `#14243A` (primary), construction orange `#F59E0B` (accent: active markers, focus, highlights; text on orange is always navy), background `#F5F7FA`, surface `#FFFFFF`, text `#172B45`, secondary text `#64748B`, with semantic success, warning, danger and info tones. Tokens live in `frontend/src/index.css` (`@theme`).
- **Type:** Archivo, a grotesque with a width axis, slightly condensed for headings and figures; Public Sans for body text and dense tables. Both are self-hosted through Fontsource.
- **Shell:** the navy sidebar and logo block form one L-shaped frame. The sidebar collapses on desktop and becomes a drawer on tablet and mobile.
- **Conventions:** sentence-case labels, tabular numbers for figures, INR formatting in lakh/crore, and a visible "Demo data" notice on any screen that is not backed by the API.

## Adding a module

1. Build the API in `backend/src/modules/<name>/` (routes → controller → service → validator), protect routes with `authenticate` + `authorize('<module>', '<action>')`, apply `buildProjectScope` in queries, and mount the router in `backend/src/routes/index.js`.
2. Add models to `backend/src/models/` and register them in `models/index.js`. Use `approvalWorkflowPlugin` for anything that goes through approval.
3. On the frontend, add a page under `frontend/src/modules/<name>/pages/` and point the manifest's `element` (or a section's `element`) at it with `lazy()`. Navigation, routing, breadcrumbs and search update automatically.

## Roadmap

| Phase | Scope |
| ----- | ----- |
| 1 (done) | Monorepo, design system, shell, auth and RBAC, health checks, dashboard layout |
| 2 | User & Access Management (users, role matrix, project assignment, audit log), Settings, Project Management (projects, tasks, milestones), Site Management (sites, daily progress reports with approval) |
| 3 | Inventory (materials, stock ledger) and Procurement (material request → approval → quotation → PO → goods receipt → stock update) |
| 4 | Budget & Finance (budgets, BOQ, expenses → approval → payment, invoices) and Document Management (uploads, versions) |
| 5 | HR & Labour (employees, attendance, leave) and Contractor Management (contracts, work orders, measurements, bills → verification → approval → payment) |
| 6 | CRM & Customers, Equipment & Maintenance, Quality & Safety (inspections, incidents) |
| 7 | Reports & Analytics workspace, live dashboard aggregates, notifications (in-app + email), exports |

Planned data models: Project, Site, Task, Milestone, Material, InventoryTransaction, MaterialRequest, Vendor, PurchaseOrder, GoodsReceipt, Budget, BOQ, Expense, Invoice, Payment, Employee, Attendance, Leave, Contractor, Contract, WorkOrder, ContractorBill, Customer, Enquiry, Equipment, Maintenance, Inspection, SafetyIncident, Document and Notification. User, Role and AuditLog already exist, along with the shared approval-workflow plugin.
