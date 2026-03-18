import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { ApolloServer } from '@apollo/server';
import { eq } from 'drizzle-orm';
import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { expressMiddleware } from '@as-integrations/express5';

import { typeDefs, resolvers } from '../graphql';
import { createLoaders } from '../lib/dataloader';
import { signToken, type TokenPayload } from '../lib/auth';
import { depthLimit, complexityLimit } from '../lib/validationRules';
import { createContext, type Context } from '../lib/context';
import { db } from '../db';
import { usersTable, postsTable } from '../db/schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Context for executeOperation */
function makeContext(user: TokenPayload | null = null, token: string | null = null): { contextValue: Context } {
  return {
    contextValue: {
      user,
      token,
      loaders: createLoaders(),
      req: {} as any,
      res: {} as any,
    },
  };
}

/** Unique email per test run to avoid collisions */
const TEST_RUN = Date.now();
const testEmail = (label: string) => `test_${label}_${TEST_RUN}@test.com`;

// ---------------------------------------------------------------------------
// Shared state across tests
// ---------------------------------------------------------------------------
let testServer: ApolloServer<Context>;
let testUser: { id: number; email: string; role: string; token: string };
let adminUser: { id: number; email: string; role: string; token: string };
let testPostId: number;

// Track IDs for cleanup
const createdUserIds: number[] = [];
const createdPostIds: number[] = [];

beforeAll(async () => {
  testServer = new ApolloServer<Context>({
    typeDefs,
    resolvers,
    validationRules: [depthLimit(5), complexityLimit(200)],
  });
  await testServer.start();
});

afterAll(async () => {
  // Clean up posts first (FK), then users
  if (createdPostIds.length > 0) {
    for (const id of createdPostIds) {
      await db.delete(postsTable).where(eq(postsTable.id, id)).catch(() => {});
    }
  }
  if (createdUserIds.length > 0) {
    for (const id of createdUserIds) {
      await db.delete(usersTable).where(eq(usersTable.id, id)).catch(() => {});
    }
  }
  await testServer.stop();
});

// ---------------------------------------------------------------------------
// Integration Tests — executeOperation
// ---------------------------------------------------------------------------

describe('Integration Tests (executeOperation)', () => {
  // -----------------------------------------------------------------------
  // Public Queries
  // -----------------------------------------------------------------------

  describe('Public Queries', () => {
    it('1. feed — returns paginated posts with default pagination', async () => {
      const res = await testServer.executeOperation(
        { query: `query { feed { items { id title published } pageInfo { total hasMore } } }` },
        makeContext(),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeUndefined();
        expect(res.body.singleResult.data?.feed).toBeDefined();
        const feed = res.body.singleResult.data!.feed as any;
        expect(Array.isArray(feed.items)).toBe(true);
        expect(feed.pageInfo).toBeDefined();
        expect(typeof feed.pageInfo.total).toBe('number');
        expect(typeof feed.pageInfo.hasMore).toBe('boolean');
      }
    });

    it('1b. feed — custom limit/offset', async () => {
      const res = await testServer.executeOperation(
        { query: `query { feed(limit: 2, offset: 0) { items { id } pageInfo { total hasMore } } }` },
        makeContext(),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeUndefined();
        const feed = res.body.singleResult.data!.feed as any;
        expect(feed.items.length).toBeLessThanOrEqual(2);
      }
    });

    it('2. post(id) — returns a specific post (or null)', async () => {
      const res = await testServer.executeOperation(
        { query: `query ($id: ID!) { post(id: $id) { id title published } }`, variables: { id: '999999' } },
        makeContext(),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeUndefined();
        // 999999 likely doesn't exist — should be null
        expect(res.body.singleResult.data?.post).toBeNull();
      }
    });

    it('3. __typename — basic introspection works', async () => {
      const res = await testServer.executeOperation(
        { query: `{ __typename }` },
        makeContext(),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeUndefined();
        expect(res.body.singleResult.data?.__typename).toBe('Query');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Auth
  // -----------------------------------------------------------------------

  describe('Auth', () => {
    const signupEmail = testEmail('signup');
    const signupPassword = 'TestPass123!';

    it('4. signup — creates user, returns token + user with role', async () => {
      const res = await testServer.executeOperation(
        {
          query: `mutation ($name: String!, $email: String!, $password: String!) {
            signup(name: $name, email: $email, password: $password) {
              token
              user { id name email role }
            }
          }`,
          variables: { name: 'Test User', email: signupEmail, password: signupPassword },
        },
        makeContext(),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeUndefined();
        const payload = res.body.singleResult.data!.signup as any;
        expect(payload.token).toBeTruthy();
        expect(payload.user.email).toBe(signupEmail);
        expect(payload.user.role).toBe('user');

        // Store for later tests
        testUser = {
          id: Number(payload.user.id),
          email: payload.user.email,
          role: payload.user.role,
          token: payload.token,
        };
        createdUserIds.push(testUser.id);
      }
    });

    it('5. login — valid credentials return token', async () => {
      const res = await testServer.executeOperation(
        {
          query: `mutation ($email: String!, $password: String!) {
            login(email: $email, password: $password) { token user { id email } }
          }`,
          variables: { email: signupEmail, password: signupPassword },
        },
        makeContext(),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeUndefined();
        const payload = res.body.singleResult.data!.login as any;
        expect(payload.token).toBeTruthy();
        expect(payload.user.email).toBe(signupEmail);
      }
    });

    it('6. login — invalid password returns error', async () => {
      const res = await testServer.executeOperation(
        {
          query: `mutation ($email: String!, $password: String!) {
            login(email: $email, password: $password) { token }
          }`,
          variables: { email: signupEmail, password: 'WrongPassword' },
        },
        makeContext(),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeDefined();
        expect(res.body.singleResult.errors![0]!.message).toBe('Invalid email or password');
      }
    });

    it('7. login — nonexistent email returns same error as bad password', async () => {
      const res = await testServer.executeOperation(
        {
          query: `mutation ($email: String!, $password: String!) {
            login(email: $email, password: $password) { token }
          }`,
          variables: { email: 'nonexistent@nowhere.com', password: 'Whatever' },
        },
        makeContext(),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeDefined();
        expect(res.body.singleResult.errors![0]!.message).toBe('Invalid email or password');
      }
    });

    it('8. signup — duplicate email returns generic error (no enumeration)', async () => {
      const res = await testServer.executeOperation(
        {
          query: `mutation ($name: String!, $email: String!, $password: String!) {
            signup(name: $name, email: $email, password: $password) { token }
          }`,
          variables: { name: 'Dupe', email: signupEmail, password: signupPassword },
        },
        makeContext(),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeDefined();
        expect(res.body.singleResult.errors![0]!.message).toBe('Unable to create account');
      }
    });

    it('9. me — without auth returns error', async () => {
      const res = await testServer.executeOperation(
        { query: `query { me { id email } }` },
        makeContext(),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeDefined();
        expect(res.body.singleResult.errors![0]!.message).toContain('Unauthorized');
      }
    });

    it('10. me — with valid auth returns current user', async () => {
      const userPayload: TokenPayload = { id: testUser.id, email: testUser.email, role: testUser.role };
      const token = signToken(userPayload);

      const res = await testServer.executeOperation(
        { query: `query { me { id email name } }` },
        makeContext(userPayload, token),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeUndefined();
        const me = res.body.singleResult.data!.me as any;
        expect(me.email).toBe(testUser.email);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Role System
  // -----------------------------------------------------------------------

  describe('Role System', () => {
    beforeAll(async () => {
      // Create an admin user via signup then promote via direct DB update
      const adminEmail = testEmail('admin');
      const signupRes = await testServer.executeOperation(
        {
          query: `mutation ($name: String!, $email: String!, $password: String!) {
            signup(name: $name, email: $email, password: $password) { token user { id email role } }
          }`,
          variables: { name: 'Admin User', email: adminEmail, password: 'AdminPass123!' },
        },
        makeContext(),
      );
      if (signupRes.body.kind === 'single') {
        const payload = signupRes.body.singleResult.data!.signup as any;
        const adminId = Number(payload.user.id);
        createdUserIds.push(adminId);

        // Promote to admin via direct DB
        await db.update(usersTable).set({ role: 'admin' }).where(eq(usersTable.id, adminId));

        const adminPayload: TokenPayload = { id: adminId, email: adminEmail, role: 'admin' };
        adminUser = {
          id: adminId,
          email: adminEmail,
          role: 'admin',
          token: signToken(adminPayload),
        };
      }
    });

    it('11. users — non-admin gets "Forbidden"', async () => {
      const userPayload: TokenPayload = { id: testUser.id, email: testUser.email, role: 'user' };
      const token = signToken(userPayload);

      const res = await testServer.executeOperation(
        { query: `query { users { items { id } pageInfo { total } } }` },
        makeContext(userPayload, token),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeDefined();
        expect(res.body.singleResult.errors![0]!.message).toBe('Forbidden');
      }
    });

    it('12. user(id) — non-admin can only look up self', async () => {
      const userPayload: TokenPayload = { id: testUser.id, email: testUser.email, role: 'user' };
      const token = signToken(userPayload);

      // Looking up another user should fail
      const res = await testServer.executeOperation(
        { query: `query ($id: ID!) { user(id: $id) { id email } }`, variables: { id: String(adminUser.id) } },
        makeContext(userPayload, token),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeDefined();
        expect(res.body.singleResult.errors![0]!.message).toBe('Forbidden');
      }

      // Looking up self should succeed
      const selfRes = await testServer.executeOperation(
        { query: `query ($id: ID!) { user(id: $id) { id email } }`, variables: { id: String(testUser.id) } },
        makeContext(userPayload, token),
      );
      expect(selfRes.body.kind).toBe('single');
      if (selfRes.body.kind === 'single') {
        expect(selfRes.body.singleResult.errors).toBeUndefined();
        const user = selfRes.body.singleResult.data!.user as any;
        expect(user.email).toBe(testUser.email);
      }
    });

    it('13. users — admin can list all users', async () => {
      const adminPayload: TokenPayload = { id: adminUser.id, email: adminUser.email, role: 'admin' };

      const res = await testServer.executeOperation(
        { query: `query { users { items { id email role } pageInfo { total hasMore } } }` },
        makeContext(adminPayload, adminUser.token),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeUndefined();
        const users = res.body.singleResult.data!.users as any;
        expect(Array.isArray(users.items)).toBe(true);
        expect(users.pageInfo.total).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  describe('Mutations', () => {
    it('14. createDraft — requires auth, creates post', async () => {
      // Without auth
      const noAuthRes = await testServer.executeOperation(
        {
          query: `mutation ($title: String!, $content: String) {
            createDraft(title: $title, content: $content) { id title published }
          }`,
          variables: { title: 'Unauthorized Draft', content: 'body' },
        },
        makeContext(),
      );
      expect(noAuthRes.body.kind).toBe('single');
      if (noAuthRes.body.kind === 'single') {
        expect(noAuthRes.body.singleResult.errors).toBeDefined();
        expect(noAuthRes.body.singleResult.errors![0]!.message).toContain('Unauthorized');
      }

      // With auth
      const userPayload: TokenPayload = { id: testUser.id, email: testUser.email, role: testUser.role };
      const token = signToken(userPayload);

      const res = await testServer.executeOperation(
        {
          query: `mutation ($title: String!, $content: String) {
            createDraft(title: $title, content: $content) { id title content published }
          }`,
          variables: { title: 'Test Draft', content: 'Draft content' },
        },
        makeContext(userPayload, token),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeUndefined();
        const post = res.body.singleResult.data!.createDraft as any;
        expect(post.title).toBe('Test Draft');
        expect(post.published).toBe(false);
        testPostId = Number(post.id);
        createdPostIds.push(testPostId);
      }
    });

    it('15. publish — only author can publish', async () => {
      // Try to publish with admin (not the author)
      const adminPayload: TokenPayload = { id: adminUser.id, email: adminUser.email, role: 'admin' };

      const forbiddenRes = await testServer.executeOperation(
        {
          query: `mutation ($id: ID!) { publish(id: $id) { id published } }`,
          variables: { id: String(testPostId) },
        },
        makeContext(adminPayload, adminUser.token),
      );
      expect(forbiddenRes.body.kind).toBe('single');
      if (forbiddenRes.body.kind === 'single') {
        expect(forbiddenRes.body.singleResult.errors).toBeDefined();
        expect(forbiddenRes.body.singleResult.errors![0]!.message).toContain('Forbidden');
      }

      // Author publishes
      const userPayload: TokenPayload = { id: testUser.id, email: testUser.email, role: testUser.role };
      const token = signToken(userPayload);

      const res = await testServer.executeOperation(
        {
          query: `mutation ($id: ID!) { publish(id: $id) { id published } }`,
          variables: { id: String(testPostId) },
        },
        makeContext(userPayload, token),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeUndefined();
        const post = res.body.singleResult.data!.publish as any;
        expect(post.published).toBe(true);
      }
    });

    it('16. deleteUser — only self can delete', async () => {
      // Create a throwaway user to delete
      const deleteEmail = testEmail('delete');
      const signupRes = await testServer.executeOperation(
        {
          query: `mutation ($name: String!, $email: String!, $password: String!) {
            signup(name: $name, email: $email, password: $password) { token user { id email role } }
          }`,
          variables: { name: 'Delete Me', email: deleteEmail, password: 'DeletePass123!' },
        },
        makeContext(),
      );
      expect(signupRes.body.kind).toBe('single');
      let deleteUserId: number;
      if (signupRes.body.kind === 'single') {
        const payload = signupRes.body.singleResult.data!.signup as any;
        deleteUserId = Number(payload.user.id);
        createdUserIds.push(deleteUserId);

        // Another user tries to delete — should fail
        const userPayload: TokenPayload = { id: testUser.id, email: testUser.email, role: testUser.role };
        const token = signToken(userPayload);

        const forbiddenRes = await testServer.executeOperation(
          {
            query: `mutation ($id: ID!) { deleteUser(id: $id) { id } }`,
            variables: { id: String(deleteUserId) },
          },
          makeContext(userPayload, token),
        );
        expect(forbiddenRes.body.kind).toBe('single');
        if (forbiddenRes.body.kind === 'single') {
          expect(forbiddenRes.body.singleResult.errors).toBeDefined();
          expect(forbiddenRes.body.singleResult.errors![0]!.message).toContain('Forbidden');
        }

        // Self-delete should succeed
        const selfPayload: TokenPayload = { id: deleteUserId, email: deleteEmail, role: 'user' };
        const selfToken = signToken(selfPayload);

        const deleteRes = await testServer.executeOperation(
          {
            query: `mutation ($id: ID!) { deleteUser(id: $id) { id email } }`,
            variables: { id: String(deleteUserId) },
          },
          makeContext(selfPayload, selfToken),
        );
        expect(deleteRes.body.kind).toBe('single');
        if (deleteRes.body.kind === 'single') {
          expect(deleteRes.body.singleResult.errors).toBeUndefined();
          const deleted = deleteRes.body.singleResult.data!.deleteUser as any;
          expect(deleted.email).toBe(deleteEmail);
          // Remove from cleanup list since already deleted
          const idx = createdUserIds.indexOf(deleteUserId);
          if (idx !== -1) createdUserIds.splice(idx, 1);
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // Pagination
  // -----------------------------------------------------------------------

  describe('Pagination', () => {
    it('17. feed(limit, offset) — returns correct pageInfo', async () => {
      const res = await testServer.executeOperation(
        { query: `query { feed(limit: 1, offset: 0) { items { id } pageInfo { total hasMore } } }` },
        makeContext(),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeUndefined();
        const feed = res.body.singleResult.data!.feed as any;
        expect(feed.items.length).toBeLessThanOrEqual(1);
        // If total > 1, hasMore should be true when offset=0 and limit=1
        if (feed.pageInfo.total > 1) {
          expect(feed.pageInfo.hasMore).toBe(true);
        }
      }
    });

    it('18. User.posts(limit) — returns paginated posts for user', async () => {
      const userPayload: TokenPayload = { id: testUser.id, email: testUser.email, role: testUser.role };
      const token = signToken(userPayload);

      const res = await testServer.executeOperation(
        {
          query: `query { me { id posts(limit: 5) { items { id title } pageInfo { total hasMore } } } }`,
        },
        makeContext(userPayload, token),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeUndefined();
        const me = res.body.singleResult.data!.me as any;
        expect(me.posts).toBeDefined();
        expect(Array.isArray(me.posts.items)).toBe(true);
        expect(typeof me.posts.pageInfo.total).toBe('number');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Security
  // -----------------------------------------------------------------------

  describe('Security', () => {
    it('19. Depth limit — deeply nested query is rejected', async () => {
      // Depth > 5 should be rejected
      const deepQuery = `query {
        feed {
          items {
            id
            title
          }
          pageInfo {
            total
            hasMore
          }
        }
        __typename
      }`;
      // That's only depth 3. Let's build a truly deep query using User.posts nesting.
      // me -> posts -> items -> ... but we can't nest deeper than the schema allows.
      // Instead, craft a query that triggers depth via repeated field nesting:
      const tooDeepQuery = `query {
        users {
          items {
            posts {
              items {
                id
                title
              }
              pageInfo {
                total
              }
            }
            email
            name
          }
          pageInfo {
            total
          }
        }
      }`;
      // users(1) -> items(2) -> posts(3) -> items(4) -> id(5) = depth 5 (ok)
      // pageInfo(4) -> total(5) = depth 5 (ok)
      // We need depth > 5. The schema doesn't allow deeper nesting naturally.
      // We can use aliases to create same-level but we need actual schema depth.
      // Let's just test that the validation rule is applied by using a mock deep query.
      // Actually the best approach: create a query string via programmatic construction.

      // Simulate depth 7 by using fragment tricks — but schema only has 5 levels max.
      // The depth limiter counts field depth regardless of schema validity for fields.
      // Actually no, invalid fields would cause a different validation error first.
      // Let's rely on the fact that depthLimit(5) is configured and test with max possible.

      // Simple test: verify the validation rule is wired up by using a custom server with depthLimit(2)
      const strictServer = new ApolloServer<Context>({
        typeDefs,
        resolvers,
        validationRules: [depthLimit(2)],
      });
      await strictServer.start();

      const res = await strictServer.executeOperation(
        {
          query: `query { feed { items { id title } pageInfo { total } } }`,
          // feed(1) -> items(2) -> id(3) = depth 3, exceeds limit of 2
        },
        makeContext(),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeDefined();
        expect(res.body.singleResult.errors![0]!.message).toContain('exceeds the maximum allowed depth');
      }

      await strictServer.stop();
    });

    it('20. Complexity limit — query with too many fields is rejected', async () => {
      const strictServer = new ApolloServer<Context>({
        typeDefs,
        resolvers,
        validationRules: [complexityLimit(2)],
      });
      await strictServer.start();

      // This query has 3+ fields, exceeding complexity limit of 2
      const res = await strictServer.executeOperation(
        {
          query: `query { feed { items { id title published } } }`,
        },
        makeContext(),
      );
      expect(res.body.kind).toBe('single');
      if (res.body.kind === 'single') {
        expect(res.body.singleResult.errors).toBeDefined();
        expect(res.body.singleResult.errors![0]!.message).toContain('exceeds the maximum allowed complexity');
      }

      await strictServer.stop();
    });
  });
});

// ---------------------------------------------------------------------------
// E2E Tests — real HTTP server
// ---------------------------------------------------------------------------

describe('E2E Tests (HTTP server)', () => {
  let httpServer: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    httpServer = http.createServer(app);

    app.use(express.json());

    const e2eServer = new ApolloServer<Context>({
      typeDefs,
      resolvers,
    });
    await e2eServer.start();

    app.use(
      '/graphql',
      cors<cors.CorsRequest>({
        origin: '*',
        credentials: true,
      }),
      expressMiddleware(e2eServer, {
        context: createContext,
      }),
    );

    app.get('/health', (_req, res) => {
      res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });

    const addr = httpServer.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('21. Health endpoint returns 200', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; timestamp: string };
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('22. POST /graphql with valid query returns 200', async () => {
    const res = await fetch(`${baseUrl}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { __typename: string } };
    expect(body.data.__typename).toBe('Query');
  });

  it('23. POST /graphql without Content-Type returns appropriate error', async () => {
    const res = await fetch(`${baseUrl}/graphql`, {
      method: 'POST',
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    // Without proper content-type, express won't parse the body
    // Apollo should return a 400 or the body won't be parsed correctly
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('24. CORS headers are present in response', async () => {
    const res = await fetch(`${baseUrl}/graphql`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://example.com',
        'Access-Control-Request-Method': 'POST',
      },
    });
    const corsHeader = res.headers.get('access-control-allow-origin');
    expect(corsHeader).toBeDefined();
    expect(corsHeader).toBe('*');
  });
});
