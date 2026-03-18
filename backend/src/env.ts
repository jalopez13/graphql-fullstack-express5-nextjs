import * as z from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+[smhd]$/, 'JWT_EXPIRES_IN must be like 15m, 1h, 7d')
    .default('7d'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  ALLOWED_ORIGINS: z
    .string()
    .transform((val) => val.split(',').map((origin) => origin.trim())),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Invalid environment variables:');
  console.error(z.treeifyError(result.error));
  process.exit(1); // stop the app if env is invalid
}

export const env = result.data;
