import { type Request, type Response } from 'express';
import { verifyToken, type TokenPayload } from './auth';
import { createLoaders, type Loaders } from './dataloader';
import { logger } from './logger';

export interface Context {
  user: TokenPayload | null;
  token: string | null;
  loaders: Loaders;
  req: Request;
  res: Response;
}

export const createContext = async ({
  req,
  res,
}: {
  req: Request;
  res: Response;
}): Promise<Context> => {
  const loaders = createLoaders();
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, token: null, loaders, req, res };
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return { user: null, token: null, loaders, req, res };
  }

  try {
    const user = verifyToken(token);
    return { user, token, loaders, req, res };
  } catch (err) {
    logger.warn({ err }, 'Invalid token');
    return { user: null, token: null, loaders, req, res };
  }
};
