import { eq } from 'drizzle-orm';
import { type Context } from './context';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { redis } from './redis';
import { logger } from './logger';

export const requireAuth = async (context: Context) => {
  if (!context.user || !context.token) {
    throw new Error('Unauthorized - please log in');
  }

  // Check user-level blacklist (fail-open on Redis errors)
  try {
    const blacklisted = await redis.get(`blacklist:user:${context.user.id}`);
    if (blacklisted) {
      throw new Error('Unauthorized - please log in');
    }
  } catch (err) {
    // Re-throw auth errors; swallow Redis connectivity failures
    if (
      err instanceof Error &&
      err.message === 'Unauthorized - please log in'
    ) {
      throw err;
    }
    logger.warn({ err }, 'Redis blacklist check failed — falling back to DB');
  }

  // Revalidate user exists and get current role from DB
  const [currentUser] = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, context.user.id))
    .limit(1);

  if (!currentUser) {
    throw new Error('Unauthorized - please log in');
  }

  // Return JWT claims with DB-verified role
  return { ...context.user, role: currentUser.role };
};

export const requireAdmin = async (context: Context) => {
  const user = await requireAuth(context);
  if (user.role !== 'admin') {
    throw new Error('Forbidden');
  }
  return user;
};
