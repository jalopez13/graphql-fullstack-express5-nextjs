import pino from 'pino';
import { env } from '../env';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'email',
      'password',
      'token',
      '*.email',
      '*.password',
      '*.token',
      'req.headers.authorization',
      'req.headers.cookie',
      'err.*.email',
      'err.*.password',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty', // human readable in dev
          options: {
            colorize: true,
            translateTime: 'SYS:YYYY-MM-DD HH:mm:ss',
            ignore: 'pid,hostname',
            singleLine: true,
          },
        }
      : undefined, // raw JSON in production
});
