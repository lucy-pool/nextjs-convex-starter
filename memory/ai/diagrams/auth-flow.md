# Authentication Flow

## Sign-In Sequence

```mermaid
sequenceDiagram
    participant B as Browser
    participant S as TanStack Start Server
    participant BA as Better Auth (Convex HTTP)
    participant X as Convex DB

    B->>S: User signs in at /signin (Password, GitHub, or Google)
    S->>BA: POST /api/auth/* (server function proxies to Convex)
    BA->>BA: Validate credentials, create session
    BA->>B: Set-Cookie (session token), redirect to /dashboard
    B->>S: Request /dashboard
    S->>S: beforeLoad: getAuth() server function
    S->>BA: Check session token
    BA->>S: Return token (or null)
    S->>B: SSR root shell + client hydration
    B->>X: useSession() — check auth client-side
    alt Not authenticated
        B->>B: Redirect to /signin (_app.tsx gate)
    else Authenticated
        B->>X: useQuery(getCurrentUser)
        X->>B: User record
        B->>B: Render AppShell + dashboard
    end
```

## Route Protection

```mermaid
graph TD
    request[Incoming Request] --> root["__root.tsx (beforeLoad: getAuth)"]
    root --> ssrToken{Got token from server?}
    ssrToken -->|Yes| setAuth["Set token on ConvexQueryClient"]
    ssrToken -->|No| noAuth["Continue without token"]
    setAuth --> render
    noAuth --> render

    render[Render Route] --> isProtected{Under /_app?}
    isProtected -->|No| public["Public route — render directly"]
    isProtected -->|Yes| appLayout["_app.tsx layout"]

    appLayout --> checkSession["useSession()"]
    checkSession --> authenticated{session exists?}
    authenticated -->|No| redirect["window.location = /signin"]
    authenticated -->|Yes| queryUser["useQuery(getCurrentUser)"]
    queryUser --> ready{user loaded?}
    ready -->|No| spinner[Show loading spinner]
    ready -->|Yes| renderApp[Render AppShell + children]
```

## JWT Flow

```mermaid
graph LR
    BetterAuth["Better Auth"] -->|"Issues JWT via session cookie"| Browser
    Browser -->|"Cookie sent with requests"| ConvexHTTP["Convex HTTP (auth routes)"]
    ConvexHTTP -->|"Validates session"| Identity["ctx.auth.getUserIdentity()"]
    Identity -->|"identity.email"| Lookup["users table (by_email index)"]
```

## Backend Auth Layers

```mermaid
graph TD
    subgraph "Function Builders (functions.ts)"
        userQuery["userQuery / userMutation"]
        adminQuery["adminQuery / adminMutation"]
        rawQuery["Raw query/mutation (public)"]
    end

    userQuery -->|"getCurrentUser(ctx)"| authHelpers["authHelpers.ts"]
    adminQuery -->|"getCurrentUser(ctx) + role check"| authHelpers
    rawQuery -->|"No auth check"| handler["Handler runs directly"]

    authHelpers -->|"ctx.user injected"| handler2["Handler gets ctx.user"]
```

## Key Files

| File | Role |
|------|------|
| `convex/auth.config.ts` | Better Auth JWT config via @convex-dev/better-auth |
| `convex/auth.ts` | Better Auth providers (Email/Password, GitHub, Google) |
| `convex/authHelpers.ts` | Auth guards (getCurrentUser, requireAuth, requireAdmin, hasRole) |
| `convex/functions.ts` | Custom function builders (userQuery, userMutation, adminQuery, adminMutation) |
| `convex/users.ts` | User CRUD (getCurrentUser, updateProfile, admin operations) |
| `src/lib/auth-server.ts` | Server-side auth helpers (getToken, handler) |
| `src/lib/auth-client.ts` | Client-side auth (useSession, signIn, signUp, signOut) |
| `src/routes/__root.tsx` | SSR auth token fetch via beforeLoad |
| `src/routes/_app.tsx` | Auth gate + user query on mount |
| `src/routes/api/auth/$.ts` | Server function — proxies auth to Convex HTTP |
| `src/routes/signin.tsx` | Sign-in (Email/Password + OAuth) |
| `src/routes/signup.tsx` | Sign-up (Email/Password + OAuth) |
