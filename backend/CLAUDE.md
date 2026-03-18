
# Backend — Agent Instructions

## Runtime

Default to Bun instead of Node.js.

- `bun <file>` instead of `node` / `ts-node`
- `bun install` instead of `npm install` / `yarn` / `pnpm`
- `bun run <script>` instead of `npm run`
- `bunx <pkg>` instead of `npx`
- `bun test` instead of `jest` / `vitest`
- Bun auto-loads `.env` — don't use `dotenv`

## Bun Built-ins

- `Bun.RedisClient` for Redis — don't use `ioredis`
- `Bun.file()` over `node:fs` readFile/writeFile
- `Bun.$\`cmd\`` over `execa`

## Stack

- **Express 5** + **Apollo Server 4** via `@as-integrations/express5`
- **Drizzle ORM** with `pg` (node-postgres) for PostgreSQL
- **Redis** via `Bun.RedisClient` (login throttling, token blacklist)
- **GraphQL Code Generator** for typed resolvers (`Resolvers<Context>`)
- **Zod 4** for input validation
- **Pino** for structured logging

## Key Commands

```sh
docker compose up -d          # Start PostgreSQL + Redis (from repo root)
bun install                   # Install dependencies
bun run generate              # Generate codegen types
bun run db:push               # Push schema to database
bun run dev                   # Start with hot reload
bun test                      # Run test suite (auto-generates types)
bun run typecheck             # TypeScript check
```

## Codegen

Schema source: `src/graphql/types/*.ts` (gql tagged templates).
Config: `codegen.ts`. Output: `src/__generated__/`.

- `Resolvers<Context>` type applied to all resolver files
- `SafeUser` mapper excludes password from resolver return types
- Run `bun run generate` after schema changes
- `src/__generated__/` is excluded from tsconfig `exclude` list but imported by resolvers

## Testing

Use `bun:test` with `describe`, `it`, `expect`, `beforeAll`, `afterAll`.

- **Integration tests**: `server.executeOperation()` with injected `contextValue`
- **E2E tests**: Real Express server on port 0 + native `fetch`
- Tests live in `src/__tests__/`
- Tests run against real PostgreSQL + Redis (Docker must be running)

## Architecture Notes

- `requireAuth()` is async — it checks Redis blacklist + loads user from DB
- All list queries are paginated: `{ items, pageInfo: { total, hasMore } }`
- `User.posts` uses DataLoader (created per-request in context)
- Login throttle uses per-email + per-IP counters in Redis
- Token revocation is user-level (`blacklist:user:<id>`), not per-token
- Query resolvers use `safeUserColumns` (excludes password hash)
- Validation rules are ESM-native (no CJS graphql-depth-limit/graphql-query-complexity)
