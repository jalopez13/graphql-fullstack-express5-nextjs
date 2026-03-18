import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { typeDefs, resolvers } from './graphql';
import { env } from './env';
import { logger } from './lib/logger';
import { httpLogger } from './lib/httpLogger';
import { createContext, type Context } from './lib/context';

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { depthLimit, complexityLimit } from './lib/validationRules';
import { formatError } from './lib/formatError';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy:
        env.NODE_ENV === 'production'
          ? undefined // use helmet defaults in production
          : false, // disable CSP in dev so Apollo Sandbox can load
    }),
  );

  app.use(express.json());
  app.use((req, _res, next) => {
    req.body ??= {};
    next();
  });

  app.use(httpLogger);

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests
    message: 'Too many requests, please try again later',
  });

  const server = new ApolloServer<Context>({
    typeDefs,
    resolvers,
    formatError,
    introspection: env.NODE_ENV !== 'production',
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    validationRules: [depthLimit(5), complexityLimit(300)],
  });

  await server.start();

  app.use(
    '/graphql',
    cors<cors.CorsRequest>({
      origin: env.ALLOWED_ORIGINS,
      credentials: true,
    }),
    limiter,
    expressMiddleware(server, {
      context: createContext,
    }),
  );

  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  httpServer.listen({ port: env.PORT }, () => {
    logger.info(
      `🚀 [${env.NODE_ENV}] Server ready at http://localhost:${env.PORT}/graphql`,
    );
  });

  // Handle shutdown signals
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    httpServer.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });

    // Force shutdown after 10s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
