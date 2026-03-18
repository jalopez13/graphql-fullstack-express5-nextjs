import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env';
import * as schema from './schema';

const pool = new Pool({
  connectionString: env.DATABASE_URL!,
  max: 20, // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ...(env.NODE_ENV === 'production' && {
    ssl: { rejectUnauthorized: true },
  }),
});

export const db = drizzle(pool, { schema });
