# Convex Auth Starter

A production-ready starter for building full-stack apps with **Convex**, **Next.js 16**, **Convex Auth**, and **shadcn/ui**. Ships with authentication, roles, email (Resend/SMTP), Cloudflare R2 file uploads, OpenRouter AI chat, a test suite, and auto-maintained architecture diagrams.

## What's Included

- **Auth** — Email/password, GitHub OAuth, Google OAuth via Convex Auth. Protected routes just work — anything under `(app)/` requires authentication.
- **Roles** — Defined once in `convex/schema.ts`. New users get `user`. Admins can promote. Add roles by editing one file.
- **Email** — Full email service with Resend and SMTP providers, built-in templates (welcome, notification, etc.), custom template editor with visual and HTML modes.
- **File uploads** — Browser-to-R2 direct upload via presigned URLs. Convex stores metadata only.
- **AI chat** — OpenRouter integration (OpenAI-compatible). Conversation history, any model.
- **Backend guards** — Custom function builders (`userQuery`, `userMutation`, `adminQuery`, `adminMutation`) auto-inject `ctx.user` and enforce auth/role checks.
- **Tests** — Backend test suite using vitest + convex-test. Auth guards, CRUD, data boundaries, email flows.
- **17 shadcn/ui components** — Button, Card, Dialog, Input, Textarea, Badge, Select, Tabs, Table, Label, Progress, Alert Dialog, Toast, Checkbox, Switch, Dropdown Menu. Add more with `bunx shadcn@latest add [component]`.

### Demo features — copy the patterns, then delete them

| Demo | Pattern it teaches |
|------|-------------------|
| **Notes** | CRUD, queries with indexes, mutations with auth guards, ownership checks, public/private visibility |
| **Files** | `@convex-dev/r2` presigned URLs, direct browser upload, progress tracking, metadata storage |
| **AI Chat** | External API calls from actions, conversation history, loading states |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (or Node.js 18+)
- A [Convex](https://convex.dev/) account

### Setup

```bash
# 1. Install dependencies
bun install

# 2. Start Convex (pushes schema, creates .env.local with CONVEX_DEPLOYMENT and NEXT_PUBLIC_CONVEX_URL)
bunx convex dev

# 3. Initialize Convex Auth (generates JWT_PRIVATE_KEY and JWKS — required for auth to work)
npx @convex-dev/auth

# 4. Start Next.js (in a second terminal)
bun dev
```

Open [http://localhost:3000](http://localhost:3000), sign up with email/password, and you'll land on the dashboard.

### Optional: GitHub OAuth

1. Create a GitHub OAuth App at [github.com/settings/developers](https://github.com/settings/developers)
   - Homepage URL: `http://localhost:3000`
   - Callback URL: your Convex site URL + `/api/auth/callback/github` (find it with `bunx convex env get SITE_URL`)
2. Set the env vars:

```bash
bunx convex env set AUTH_GITHUB_ID your-github-client-id
bunx convex env set AUTH_GITHUB_SECRET your-github-client-secret
```

### Optional: Google OAuth

1. Create credentials in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Authorized redirect URI: your Convex site URL + `/api/auth/callback/google`
2. Set the env vars:

```bash
bunx convex env set AUTH_GOOGLE_ID your-google-client-id
bunx convex env set AUTH_GOOGLE_SECRET your-google-client-secret
```

### Optional: Cloudflare R2 (file uploads)

1. Create an R2 bucket in [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2** → **Create Bucket**
2. Create an R2 API token: **R2** → **Manage R2 API Tokens** → **Create API Token** (Object Read & Write, scoped to your bucket)
3. Set env vars:

```bash
bunx convex env set R2_ENDPOINT https://<ACCOUNT_ID>.r2.cloudflarestorage.com
bunx convex env set R2_ACCESS_KEY_ID <your-access-key-id>
bunx convex env set R2_SECRET_ACCESS_KEY <your-secret-access-key>
bunx convex env set R2_BUCKET <your-bucket-name>
```

4. Configure CORS on the bucket (**R2** → your bucket → **Settings** → **CORS Policy**):

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://your-domain.com",
      "https://*.your-domain.com"
    ],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

### Optional: OpenRouter (AI chat)

```bash
bunx convex env set OPENROUTER_API_KEY sk-or-v1-...
bunx convex env set DEFAULT_OPENROUTER_MODEL google/gemini-3-flash-preview
```

Browse models at [openrouter.ai/models](https://openrouter.ai/models). Defaults to `mistralai/devstral-2512:free` if not set.

### Optional: Email (Resend or SMTP)

For Resend:
```bash
bunx convex env set RESEND_API_KEY re_...
bunx convex env set EMAIL_FROM "Your App <noreply@yourdomain.com>"
```

For SMTP:
```bash
bunx convex env set SMTP_HOST smtp.example.com
bunx convex env set SMTP_PORT 587
bunx convex env set SMTP_USER your-username
bunx convex env set SMTP_PASS your-password
bunx convex env set EMAIL_FROM "Your App <noreply@yourdomain.com>"
```

## Project Structure

```
convex/                          # Backend
  schema.ts                      # Tables, indexes, role + fileType validators
  auth.ts                        # Convex Auth providers (Password, GitHub, Google)
  auth.config.ts                 # Self-issued JWT config
  authHelpers.ts                 # Auth guards (requireAuth, requireAdmin, hasRole)
  functions.ts                   # Custom builders (userQuery, userMutation, adminQuery, adminMutation)
  users.ts                       # User CRUD
  notes.ts                       # Demo CRUD (delete me)

  email/                         # Email service
    send.ts                      # sendEmail, resendEmail
    logs.ts                      # Email log management
    templates.ts                 # Custom template CRUD
    actions.ts                   # "use node" — email delivery
    builtinTemplates.tsx         # React Email templates (welcome, notification, etc.)

  storage/                       # File storage
    files.ts                     # File metadata CRUD
    r2.ts                        # R2 client + presigned upload URLs
    downloads.ts                 # "use node" — presigned download URLs

  ai/                            # AI chat
    messages.ts                  # Message history CRUD
    chat.ts                      # "use node" — OpenRouter completions

src/app/                         # Frontend (Next.js App Router)
  layout.tsx                     # Root: ConvexAuthNextjsServerProvider
  page.tsx                       # Landing page
  signin/page.tsx                # Sign-in (Password + OAuth)
  signup/page.tsx                # Sign-up (Password + OAuth)
  (app)/                         # Protected routes
    layout.tsx                   # Auth gate (redirects to /signin)
    dashboard/page.tsx           # Welcome + demo links
    notes/page.tsx               # Demo: CRUD
    files/page.tsx               # Demo: R2 upload
    ai-chat/page.tsx             # Demo: OpenRouter chat

src/components/
  providers.tsx                  # ConvexAuthProvider wiring
  layout/
    app-shell.tsx                # Sidebar + topbar + content
    sidebar.tsx                  # Nav items — add your routes here
    topbar.tsx                   # User menu + theme toggle
  ui/                            # 17 shadcn/ui components

tests/convex/                    # Backend tests (vitest + convex-test)
```

## Building Your App

### 1. Add a table

In `convex/schema.ts`:

```typescript
projects: defineTable({
  name: v.string(),
  ownerId: v.id("users"),
  status: v.union(v.literal("active"), v.literal("archived")),
  createdAt: v.number(),
})
  .index("by_owner", ["ownerId"]),
```

### 2. Write backend functions

Create `convex/projects.ts`:

```typescript
import { v } from "convex/values";
import { userQuery, userMutation } from "./functions";

export const list = userQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
      .collect();
  },
});

export const create = userMutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert("projects", {
      name: args.name,
      ownerId: ctx.user._id,
      status: "active",
      createdAt: Date.now(),
    });
  },
});
```

### 3. Create a page

Create `src/app/(app)/projects/page.tsx`:

```typescript
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";

export default function ProjectsPage() {
  const projects = useQuery(api.projects.list);
  const createProject = useMutation(api.projects.create);
  // ... your UI
}
```

### 4. Add it to the sidebar

In `src/components/layout/sidebar.tsx`, add to the nav items array.

### 5. Delete the demos

Remove what you don't need:
- **Notes:** `convex/notes.ts`, `src/app/(app)/notes/`, `notes` table from schema
- **Files demo page:** `src/app/(app)/files/` (keep `convex/storage/` if you need uploads)
- **AI demo page:** `src/app/(app)/ai-chat/` (keep `convex/ai/` if you need AI)

## Convex Cheat Sheet

| Concept | Rule |
|---------|------|
| **Queries** | Reactive, re-run on data change. No side effects. |
| **Mutations** | Transactional. No `fetch()` or external API calls. |
| **Actions** | For side effects (APIs, email, etc). Use `ctx.runQuery()`/`ctx.runMutation()` for DB. |
| **`"use node"` files** | Only export actions. Required for Node.js packages. |
| **New fields** | Use `v.optional()` when adding to tables that already have data. |
| **Scheduling** | Use `ctx.scheduler.runAfter(0, ...)` from mutations for async work. |
| **Auth in functions** | Use `userQuery`/`userMutation` from `./functions` — auth is automatic via `ctx.user`. |

## Environment Variables

| Variable | Where to set | Description |
|----------|-------------|-------------|
| `CONVEX_DEPLOYMENT` | `.env.local` | Auto-set by `bunx convex dev` |
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | Auto-set by `bunx convex dev` |
| `JWT_PRIVATE_KEY` | Convex dashboard | Auto-set by `npx @convex-dev/auth` |
| `JWKS` | Convex dashboard | Auto-set by `npx @convex-dev/auth` |
| `SITE_URL` | Convex dashboard | Auto-set by `npx @convex-dev/auth` |
| `AUTH_GITHUB_ID` | Convex dashboard | GitHub OAuth client ID |
| `AUTH_GITHUB_SECRET` | Convex dashboard | GitHub OAuth client secret |
| `AUTH_GOOGLE_ID` | Convex dashboard | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Convex dashboard | Google OAuth client secret |
| `R2_ENDPOINT` | Convex dashboard | Cloudflare R2 S3-compatible endpoint |
| `R2_ACCESS_KEY_ID` | Convex dashboard | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | Convex dashboard | R2 API token secret |
| `R2_BUCKET` | Convex dashboard | R2 bucket name |
| `OPENROUTER_API_KEY` | Convex dashboard | OpenRouter API key |
| `DEFAULT_OPENROUTER_MODEL` | Convex dashboard | Default model (default: devstral free) |
| `RESEND_API_KEY` | Convex dashboard | Resend API key (if using Resend) |
| `EMAIL_FROM` | Convex dashboard | Sender address for emails |
| `SMTP_HOST` | Convex dashboard | SMTP server host (if using SMTP) |
| `SMTP_PORT` | Convex dashboard | SMTP port |
| `SMTP_USER` | Convex dashboard | SMTP username |
| `SMTP_PASS` | Convex dashboard | SMTP password |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Missing environment variable JWT_PRIVATE_KEY` | Run `npx @convex-dev/auth` |
| `Missing environment variable JWKS` | Run `npx @convex-dev/auth` — it sets both keys |
| Auth not working after sign-up | Check `JWT_PRIVATE_KEY` and `JWKS` are set: `bunx convex env list` |
| OAuth redirect errors | Verify callback URLs match your Convex site URL |
| File uploads failing | Check all 4 R2 env vars and CORS on the bucket |
| AI chat error | Verify `OPENROUTER_API_KEY` is set |
| `bunx convex dev` won't start | Run `bun install` first, ensure you're logged in |

## License

MIT
