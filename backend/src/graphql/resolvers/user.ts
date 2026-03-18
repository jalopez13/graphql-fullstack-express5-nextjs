import { eq, count } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { db } from '../../db';
import { usersTable, postsTable } from '../../db/schema';
import {
  validate,
  idSchema,
  userSchemas,
  paginationSchema,
} from '../../validators/graphql';
import { signToken } from '../../lib/auth';
import { requireAuth, requireAdmin } from '../../lib/requireAuth';
import { logger } from '../../lib/logger';
import { redis } from '../../lib/redis';
import {
  checkLoginThrottle,
  recordFailedLogin,
  clearLoginThrottle,
} from '../../lib/loginThrottle';
import type { Resolvers } from '../../__generated__/resolvers-types';

// Safe column set — excludes password hash from query results
const safeUserColumns = {
  id: usersTable.id,
  name: usersTable.name,
  email: usersTable.email,
  role: usersTable.role,
  createdAt: usersTable.createdAt,
  updatedAt: usersTable.updatedAt,
} as const;

export const userResolvers: Resolvers = {
  Query: {
    me: async (_parent, _args, context) => {
      const user = await requireAuth(context);

      const [found] = await db
        .select(safeUserColumns)
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1);

      return found ?? null;
    },

    users: async (_parent, args, context) => {
      await requireAdmin(context);

      const { limit, offset } = validate(paginationSchema, args);

      const [items, countResult] = await Promise.all([
        db.select(safeUserColumns).from(usersTable).limit(limit).offset(offset),
        db.select({ total: count() }).from(usersTable),
      ]);
      const total = countResult[0]?.total ?? 0;

      return {
        items,
        pageInfo: { total, hasMore: offset + limit < total },
      };
    },

    user: async (_parent, args, context) => {
      const actor = await requireAuth(context);
      const { id } = validate(idSchema, args);

      if (actor.role !== 'admin' && actor.id !== id) {
        throw new Error('Forbidden');
      }

      const [user] = await db
        .select(safeUserColumns)
        .from(usersTable)
        .where(eq(usersTable.id, id))
        .limit(1);

      return user ?? null;
    },
  },

  Mutation: {
    signup: async (_parent, args) => {
      const { name, email, password } = validate(userSchemas.signup, args);

      // Always hash first to prevent timing-based email enumeration
      const hashedPassword = await bcrypt.hash(password, 10);

      const [existingUser] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);

      if (existingUser) {
        throw new Error('Unable to create account');
      }

      const [newUser] = await db
        .insert(usersTable)
        .values({ name, email, password: hashedPassword })
        .returning(safeUserColumns);

      if (!newUser) {
        throw new Error('Failed to create user');
      }

      logger.info({ id: newUser.id }, 'User signed up');

      const token = signToken({
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
      });

      return { token, user: newUser };
    },

    login: async (_parent, args, context) => {
      const { email, password } = validate(userSchemas.login, args);
      const ip = context.req?.ip ?? 'unknown';

      // Per-account + per-IP throttling
      await checkLoginThrottle(email, ip);

      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);

      if (!user) {
        await recordFailedLogin(email, ip);
        throw new Error('Invalid email or password');
      }

      const passwordMatch = await bcrypt.compare(password, user.password);

      if (!passwordMatch) {
        await recordFailedLogin(email, ip);
        throw new Error('Invalid email or password');
      }

      await clearLoginThrottle(email);

      logger.info({ id: user.id }, 'User logged in');

      const token = signToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      // Return safe user (without password hash)
      const { password: _, ...safeUser } = user;
      return { token, user: safeUser };
    },

    deleteUser: async (_parent, args, context) => {
      const actor = await requireAuth(context);
      const { id } = validate(idSchema, args);

      if (actor.id !== id) {
        throw new Error('Forbidden — you can only delete your own account');
      }

      const [deletedUser] = await db
        .delete(usersTable)
        .where(eq(usersTable.id, id))
        .returning(safeUserColumns);

      if (!deletedUser) {
        throw new Error(`User with id ${id} not found`);
      }

      // Blacklist by user ID (invalidates ALL sessions for this user)
      if (context.token) {
        const parts = context.token.split('.');
        const payload = JSON.parse(
          Buffer.from(parts[1]!, 'base64').toString(),
        );
        const ttl = Math.max(
          (payload.exp ?? 0) - Math.floor(Date.now() / 1000),
          60,
        );
        await redis.set(`blacklist:user:${actor.id}`, '1', 'EX', ttl);
      }

      return deletedUser;
    },
  },

  User: {
    posts: async (parent, args, context) => {
      const { limit, offset } = validate(paginationSchema, {
        limit: args.limit ?? 10,
        offset: args.offset ?? 0,
      });

      if (offset === 0) {
        const allPosts = await context.loaders.postsByAuthor.load(parent.id);
        const items = allPosts.slice(0, limit);
        return {
          items,
          pageInfo: {
            total: allPosts.length,
            hasMore: limit < allPosts.length,
          },
        };
      }

      const [items, countResult] = await Promise.all([
        db
          .select()
          .from(postsTable)
          .where(eq(postsTable.authorId, parent.id))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: count() })
          .from(postsTable)
          .where(eq(postsTable.authorId, parent.id)),
      ]);
      const total = countResult[0]?.total ?? 0;

      return {
        items,
        pageInfo: { total, hasMore: offset + limit < total },
      };
    },
  },
};
