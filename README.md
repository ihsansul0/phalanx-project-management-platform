# Phalanx // Project Orchestration System

Phalanx is a real-time, multi-tenant B2B SaaS project management platform built for high-velocity engineering teams. It moves beyond generic task-tracking by organizing projects into isolated, secure workspace nodes driven by an instant-sync data pipeline.

---

## The Core Architecture Matrix

Phalanx is engineered using the **T3 Stack** pattern, optimizing for absolute type-safety from the database layer all the way to the client browser viewports.

| Component | Technology | Operational Role |
| :--- | :--- | :--- |
| **Runtime Framework** | Next.js (App Router) | Handles asymmetric server component data fetching and streaming layouts. |
| **Communication Layer**| tRPC | Enforces compile-time, end-to-end type-safe API routing. |
| **Database Engines** | Neon Postgres + Drizzle ORM | Serverless relational data layer managed through programmatic TypeScript schemas. |
| **Perimeter Security** | Clerk Auth | Edge-level authentication, session tracking, and multi-tenant organization scopes. |
| **Live Sync Network** | Pusher WebSockets | Event broadcasting grid driving real-time interface reconciliation. |

---

## Key Engineering Pillars

### 1. Zero-Trust Multi-Tenant Isolation
Every domain entity including `projects`, `tasks`, and `comments` is hard-anchored with a `workspaceId` matching the user's active Clerk Organization token. All tRPC routers enforce data perimeter fencing via flat, optimized `where` clauses, preventing cross-tenant data leaks at the query layer.

### 2. Automated Webhook Synchronization
User profiles and team configurations are never manually handled by vulnerable database forms. Instead, asymmetric events fired by Clerk’s infrastructure are securely captured by our background webhook routing system (`src/app/api/webhooks/clerk`), which programmatically reflects state changes into our Neon Postgres instances instantly.

### 3. Real-Time Collaboration Canvas
The task board bypasses traditional "request-response" page refreshes entirely. When an operator alters a task state, client-side actions broadcast lightweight payloads over a secure WebSocket channel using Pusher. Sibling client panels capture the stream and update board cards instantly.

---

## Repository Directory Blueprint

```text
phalanx/
├── src/
│   ├── app/                 # Next.js App Router Pages & API Webhooks
│   │   ├── (auth)/          # Clerk Authentication Interceptors
│   │   ├── api/webhooks/    # B2B State Synchronizer Webhooks
│   │   ├── dashboard/       # Core Operational UI Workspace Views
│   │   └── icon.svg         # Dynamic SVG Theme-Adaptive Favicon
│   ├── components/
│   │   ├── shared/          # Live Taskboards, Drawers, & Forms
│   │   └── ui/              # Primitive Tailwind Component Library
│   ├── server/
│   │   ├── api/routers/     # Protected tRPC Business Logic Routers
│   │   └── db/              # Drizzle Schemas & Connection Hubs
│   └── lib/                 # Shared Utility Functions
└── drizzle.config.ts        # Database Migration Matrix Settings
```

---

## Local Ignition Sequence

Follow these operational steps to fire up the development environment locally.

### Prerequisites
Ensure your local machine has **Node.js** and **pnpm** installed.

### 1. Clone the Environment & Install Dependencies
```bash
git clone https://github.com/ihsansul0/phalanx-project-orchestration-system.git
cd phalanx
pnpm install
```

### 2. Provision Environment Configurations
Create a `.env` file in the root directory and populate it with your infrastructure tokens:

```env
# 1. THE INVENTORY SYSTEM (Neon PostgreSQL)
DATABASE_URL="postgresql://..."

# 2. THE BOUNCER (Clerk Authentication)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."

# Clerk Routing Rules
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL="/dashboard"
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL="/dashboard"

# 3. PUSHER (WebSockets)
PUSHER_APP_ID="..."
NEXT_PUBLIC_PUSHER_KEY="..."
PUSHER_SECRET="..."
NEXT_PUBLIC_PUSHER_CLUSTER="..."

# 4. CLERK WEBHOOKS
CLERK_WEBHOOK_SECRET="whsec_..."
```

### 3. Initialize Database Migrations
Push your schema architecture directly into your active Postgres database instance:
```bash
pnpm db:push
```

### 4. Execute Development Core
Fire up the local runtime engine:
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) inside your browser window to initialize the system console.
```