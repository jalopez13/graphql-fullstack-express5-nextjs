import jwt, { type SignOptions, type VerifyOptions } from 'jsonwebtoken';
import { env } from '../env';

const JWT_ALGORITHM = 'HS256' as const;
const JWT_ISSUER = 'graphql-backend';
const JWT_AUDIENCE = 'graphql-client';

export interface TokenPayload {
  id: number;
  email: string;
  role: string;
}

export const signToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    algorithm: JWT_ALGORITHM,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };

  return jwt.sign(payload, env.JWT_SECRET, options);
};

export const verifyToken = (token: string): TokenPayload => {
  const options: VerifyOptions = {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };

  return jwt.verify(token, env.JWT_SECRET, options) as unknown as TokenPayload;
};
