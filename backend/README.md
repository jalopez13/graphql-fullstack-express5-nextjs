# GraphQL Backend API

A GraphQL API server built with Express 5, Apollo Server 4, PostgreSQL, and Redis. Features JWT authentication with role-based access control, per-account login throttling, paginated queries, DataLoader batching, codegen-typed resolvers, and a comprehensive test suite.

## Tech Stack

| Category | Technology |
|----------|-----------|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript (strict mode) |
| Server | [Express 5](https://expressjs.com/) |
| GraphQL | [Apollo Server 4](https://www.apollographql.com/docs/apollo-server/) via [`@as-integrations/express5`](https://github.com/apollo-server-integrations/apollo-server-integration-express5) |
| Database | [PostgreSQL 16](https://www.postgresql.org/) |
| Cache | [Redis 7](https://redis.io/) (login throttling, token revocation) |
| ORM | [Drizzle ORM](https://orm.drizzle.team/) |
| Auth | [JSON Web Tokens](https://github.com/auth0/node-jsonwebtoken) + [bcrypt](https://github.com/kelektiv/node.bcrypt.js) |
| Validation | [Zod 4](https://zod.dev/) |
| Codegen | [GraphQL Code Generator](https://the-guild.dev/graphql/codegen) |
| Logging | [Pino](https://getpino.io/) |
| Testing | [bun:test](https://bun.sh/docs/cli/test) + `executeOperation()` |

## Features

- **GraphQL API** — Queries and mutations for users and posts via Apollo Server 4
- **JWT Authentication** — Signup/login with hashed passwords and Bearer token auth
- **Role-Based Access Control** — Admin-only queries (`users`), self-or-admin access (`user`)
- **Token Revocation** — User-level Redis blacklist invalidates all sessions on account deletion
- **DB-Verified Auth** — Every authenticated request revalidates user existence and current role from the database
- **Per-Account Login Throttling** — Combined per-email (5/15min) and per-IP (20/15min) rate limiting via Redis
- **Pagination** — All list queries return `{ items, pageInfo: { total, hasMore } }` with offset/limit
- **DataLoader** — Batched `User.posts` loading prevents N+1 queries
- **Codegen Typed Resolvers** — `Resolvers<Context>` type generated from schema, catches drift at compile time
- **Query Security** — Depth limiting with cycle detection, weighted complexity analysis, alias fan-out cap
- **Rate Limiting** — 100 requests per 15 minutes per IP on the `/graphql` endpoint
- **HTTP Security** — Helmet middleware for secure headers, CORS with allowlisted origins
- **Input Validation** — All inputs validated with Zod (ID range-checked, offset capped, passwords bounded)
- **Structured Logging** — Pino with pretty single-line output in dev, JSON in production
- **Error Formatting** — Allowlist-based: only safe business errors exposed in production
- **Health Check** — `GET /health` endpoint for monitoring
- **Graceful Shutdown** — Handles SIGTERM/SIGINT with drain plugin and 10s forced timeout
- **Test Suite** — 25 integration + E2E tests covering auth, roles, pagination, security, and HTTP

## Prerequisites

- [Bun](https://bun.sh) (latest)
- [Docker](https://www.docker.com/) (for PostgreSQL and Redis)

## Getting Started

### 1. Start infrastructure

From the repo root (`../`):

```sh
docker compose up -d
```

This starts PostgreSQL 16 and Redis 7 with health checks and persistent volumes. The `docker-compose.yml` lives at the repo root and is shared across all apps.

### 2. Install dependencies

```sh
bun install
```

### 3. Configure environment variables

Create a `.env` file in the `backend/` directory:

```env
# App
NODE_ENV=development
PORT=4000

# CORS
ALLOWED_ORIGINS=https://studio.apollographql.com,http://localhost:3000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/graphql_express

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=replace-with-at-least-32-character-secret
JWT_EXPIRES_IN=1h
```

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | `development`, `production`, or `test` | `development` |
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | *required* |
| `REDIS_URL` | Redis connection string | *required* |
| `JWT_SECRET` | Secret key for signing JWTs (min 32 chars) | *required* |
| `JWT_EXPIRES_IN` | Token expiration (e.g. `1h`, `7d`, `15m`) | `7d` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | *required* |

Environment variables are validated at startup with Zod. The server will not start if any required variable is missing or invalid.

### 4. Set up the database

```sh
# Push schema directly (development)
bun run db:push

# Or generate and run migrations
bun run db:generate
bun run db:migrate

# Seed sample data
bun run db:seed
```

### 5. Generate types

```sh
bun run generate
```

### 6. Start the server

```sh
# Development (hot reload)
bun run dev

# Production
bun run start
```

The Apollo Sandbox is available at `http://localhost:4000/graphql` in development.

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `bun run dev` | Start with hot reload |
| `start` | `bun run start` | Start in production mode |
| `build` | `bun run build` | Bundle to `dist/` |
| `generate` | `bun run generate` | Generate TypeScript types from GraphQL schema |
| `test` | `bun test` | Run test suite (auto-generates types via `pretest`) |
| `typecheck` | `bun run typecheck` | Run TypeScript type checking |
| `db:generate` | `bun run db:generate` | Generate SQL migrations from schema |
| `db:migrate` | `bun run db:migrate` | Run pending migrations |
| `db:push` | `bun run db:push` | Push schema directly to database |
| `db:pull` | `bun run db:pull` | Pull schema from database |
| `db:studio` | `bun run db:studio` | Open Drizzle Studio (database GUI) |
| `db:seed` | `bun run db:seed` | Seed database with sample posts |

## GraphQL Schema

### Types

```graphql
type User {
  id: ID!
  name: String!
  email: String!
  role: String!
  posts(limit: Int = 10, offset: Int = 0): PaginatedPosts!
  createdAt: String!
}

type Post {
  id: ID!
  title: String!
  content: String
  published: Boolean!
}

type AuthPayload {
  token: String!
  user: User!
}

type PageInfo {
  total: Int!
  hasMore: Boolean!
}

type PaginatedPosts {
  items: [Post!]!
  pageInfo: PageInfo!
}

type PaginatedUsers {
  items: [User!]!
  pageInfo: PageInfo!
}
```

### Queries

| Query | Auth | Description |
|-------|:---:|-------------|
| `feed(limit, offset)` | No | Published posts (paginated) |
| `post(id: ID!)` | No | Single post (unpublished only visible to author) |
| `drafts(limit, offset)` | Yes | Authenticated user's unpublished posts (paginated) |
| `users(limit, offset)` | Admin | All users (paginated, admin-only) |
| `user(id: ID!)` | Yes | Single user (admin or self only) |
| `me` | Yes | Current authenticated user |

### Mutations

| Mutation | Auth | Description |
|----------|:---:|-------------|
| `signup(name, email, password)` | No | Create account, returns JWT + user |
| `login(email, password)` | No | Authenticate, returns JWT + user |
| `createDraft(title, content?)` | Yes | Create an unpublished post |
| `publish(id)` | Yes | Publish a draft (author only) |
| `deleteUser(id)` | Yes | Delete account (self only, revokes all sessions) |

## Authentication

The API uses JWT Bearer tokens with role-based access control.

1. **Sign up** or **log in** to receive a token:

```graphql
mutation {
  signup(name: "Alice", email: "alice@example.com", password: "password123") {
    token
    user { id name email role }
  }
}
```

2. **Include the token** in the `Authorization` header:

```
Authorization: Bearer <your-jwt-token>
```

- Tokens are HS256-signed with `issuer` and `audience` claims
- Contain `id`, `email`, and `role`; role is revalidated from DB on every request
- Passwords hashed with bcrypt (10 rounds), 8-72 character limit enforced
- On account deletion, all sessions are invalidated via Redis user-level blacklist

## Database

### Schema

**users**
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `integer` | Primary key, auto-generated |
| `name` | `varchar(255)` | Not null |
| `email` | `varchar(255)` | Not null, unique |
| `password` | `text` | Not null |
| `role` | `varchar(20)` | Not null, default `'user'` |
| `createdAt` | `timestamp` | Default `now()` |
| `updatedAt` | `timestamp` | Default `now()` |

**posts**
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `integer` | Primary key, auto-generated |
| `title` | `varchar(255)` | Not null |
| `content` | `text` | Nullable |
| `published` | `boolean` | Default `false` |
| `authorId` | `integer` | Foreign key -> `users.id` |
| `createdAt` | `timestamp` | Default `now()` |
| `updatedAt` | `timestamp` | Default `now()` |

**Indexes:** `posts_title_idx`, `posts_published_idx`, `posts_author_idx`

### Connection Pool

- Max connections: **20**
- Idle timeout: **30s**
- Connection timeout: **2s**
- SSL with `rejectUnauthorized: true` in production

## Project Structure

```
backend/
├── codegen.ts                   # GraphQL Code Generator config
├── drizzle.config.ts            # Drizzle Kit config
├── drizzle/                     # Generated SQL migrations
├── src/
│   ├── __generated__/           # Codegen output (resolver types, gql helpers)
│   ├── __tests__/
│   │   └── graphql.test.ts      # Integration + E2E test suite (25 tests)
│   ├── db/
│   │   ├── index.ts             # Database connection & Drizzle instance
│   │   ├── schema.ts            # Table definitions, relations, types
│   │   └── seed.ts              # Seed script
│   ├── graphql/
│   │   ├── index.ts             # Re-exports resolvers & typeDefs
│   │   ├── resolvers/
│   │   │   ├── index.ts         # Merges resolvers (typed as Resolvers<Context>)
│   │   │   ├── post.ts          # Post resolvers (paginated feed/drafts)
│   │   │   └── user.ts          # User resolvers (RBAC, throttling, revocation)
│   │   └── types/
│   │       ├── index.ts         # Merges type definitions
│   │       ├── post.ts          # Post/PageInfo/PaginatedPosts types
│   │       └── user.ts          # User/AuthPayload/PaginatedUsers types
│   ├── lib/
│   │   ├── auth.ts              # JWT sign & verify (HS256, issuer/audience)
│   │   ├── context.ts           # Request context (user, token, DataLoaders)
│   │   ├── dataloader.ts        # DataLoader factory (batched User.posts)
│   │   ├── formatError.ts       # Allowlist-based error masking
│   │   ├── httpLogger.ts        # HTTP request logging middleware
│   │   ├── logger.ts            # Pino logger (wildcard PII redaction)
│   │   ├── loginThrottle.ts     # Per-email + per-IP rate limiting via Redis
│   │   ├── redis.ts             # Bun Redis client
│   │   ├── requireAuth.ts       # Auth guard (DB revalidation, Redis fail-open)
│   │   └── validationRules.ts   # Depth limit (cycle-safe), weighted complexity
│   ├── validators/
│   │   └── graphql.ts           # Zod schemas (ID, pagination, user, post)
│   ├── env.ts                   # Environment validation (Zod)
│   └── index.ts                 # Server entry point
├── package.json
└── tsconfig.json
```

## Security

- **Apollo Server 4** — CSRF prevention on, batching off by default
- **Helmet** — Secure HTTP headers (CSP, HSTS, X-Frame-Options)
- **CORS** — Restricted to explicitly allowlisted origins
- **Rate Limiting** — 100 requests/15min per IP
- **Login Throttling** — Per-email (5/15min) + per-IP (20/15min) via Redis
- **Depth Limit** — Max depth 5 with fragment cycle detection (prevents DoS)
- **Complexity Limit** — Weighted field cost (list fields 10x) + alias fan-out cap (30)
- **Role-Based Access** — Admin-only and self-or-admin query restrictions
- **Token Revocation** — User-level Redis blacklist on account deletion (all sessions)
- **DB-Verified Auth** — User existence and role checked from DB on every request
- **Redis Fail-Open** — Auth falls back to DB check if Redis is unavailable
- **Password Exclusion** — Query resolvers never select password column from DB
- **Password Hashing** — bcrypt with 10 salt rounds, 72-byte max enforced
- **Input Validation** — IDs range-checked (1-2147483647), offset capped at 10000
- **Env Validation** — JWT_SECRET min 32 chars, TTL format enforced, origins validated
- **Error Masking** — Only allowlisted business errors exposed in production
- **Log Redaction** — Wildcard PII redaction (`*.email`, `*.password`, `*.token`)
- **Introspection** — Disabled in production
- **x-powered-by** — Disabled

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/graphql` | GraphQL API endpoint |
| `GET` | `/graphql` | Apollo Sandbox (development only) |
| `GET` | `/health` | Health check (returns status and timestamp) |
