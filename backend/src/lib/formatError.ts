import { type GraphQLFormattedError } from 'graphql';
import { env } from '../env';
import { logger } from './logger';

// Business errors safe to expose to clients
const CLIENT_SAFE_MESSAGES = new Set([
  'Unable to create account',
  'Invalid email or password',
  'Unauthorized - please log in',
  'Forbidden — you can only delete your own account',
  'Forbidden — you can only publish your own posts',
  'Forbidden',
]);

const isClientSafe = (message: string): boolean => {
  if (CLIENT_SAFE_MESSAGES.has(message)) return true;
  // Allow "X with id N not found" style errors from our resolvers
  if (/^(Post|User) with id \d+ not found$/.test(message)) return true;
  // Allow validation errors from Zod
  if (message.includes('is required') || message.includes('is too long'))
    return true;
  return false;
};

export const formatError = (error: GraphQLFormattedError, _originalError: unknown) => {
  // Always log the full error server-side
  logger.error({ error }, 'GraphQL error');

  // In production, only expose whitelisted business errors
  if (env.NODE_ENV === 'production' && !isClientSafe(error.message)) {
    return { message: 'Internal server error' };
  }

  return error;
};
