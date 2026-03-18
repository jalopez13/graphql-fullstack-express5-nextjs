import * as z from 'zod';

// Shared validate helper
export const validate = <T>(schema: z.ZodSchema<T>, args: unknown): T => {
  const result = schema.safeParse(args);
  if (!result.success) {
    throw new Error(result.error.issues.map((i) => i.message).join(', '));
  }
  return result.data;
};

// Shared schemas used across multiple resolvers
export const idSchema = z.object({
  id: z.coerce
    .number()
    .int('ID must be an integer')
    .min(1, 'ID must be a positive number')
    .max(2147483647, 'ID out of range'),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10000, 'Offset too large').default(0),
});

// Feature specific schemas
export const postSchemas = {
  createDraft: z.object({
    title: z.string().min(1, 'Title is required').max(255, 'Title is too long'),
    content: z.string().optional(),
  }),
};

export const userSchemas = {
  signup: z.object({
    name: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
    email: z.email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password must be at most 72 characters')
      .refine(
        (val) => new TextEncoder().encode(val).length <= 72,
        'Password must be at most 72 bytes',
      ),
  }),
  login: z.object({
    email: z.email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
};
