import { createServer } from 'http';
import { app, httpServer } from './app';
import { env } from './config/environment';
import { connectDatabase, disconnectDatabase } from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import { initializeMinIO } from './config/minio';
import { logger } from './utils/logger';

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  
  try {
    // Close HTTP server
    httpServer.close(() => {
      logger.info('✅ HTTP server closed');
    });

    // Disconnect from databases
    await disconnectDatabase();
    await disconnectRedis();

    logger.info('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in development
  if (env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start server
async function startServer() {
  try {
    logger.info('🚀 Starting Store API server...');

    // Connect to databases
    logger.info('📦 Connecting to databases...');
    await connectDatabase();
    
    // Try to connect to Redis (optional, non-blocking)
    connectRedis().catch(() => {
      // Silently handle Redis connection failure
    });

    // Try to initialize MinIO storage (optional)
    try {
      logger.info('📁 Initializing file storage...');
      await initializeMinIO();
    } catch (error) {
      logger.warn('⚠️ MinIO not available - file storage disabled');
    }

    // Start HTTP server
    const port = parseInt(env.PORT);

    // Bind to a specific interface. Node defaults to 0.0.0.0 (all interfaces),
    // which Windows refuses with `EACCES: permission denied 0.0.0.0:<port>`
    // when the port falls inside a reserved/excluded range (Hyper-V, WSL2,
    // Docker Desktop) or a firewall policy blocks binding every interface.
    // Set HOST=0.0.0.0 explicitly if you need LAN access.
    const host = process.env.HOST || '127.0.0.1';

    // --- Dual-stack loopback -------------------------------------------------
    // Binding 127.0.0.1 alone is an IPv4-only socket. The browser calls
    // `http://localhost:3001`, and on Windows (and modern macOS) `localhost`
    // resolves to ::1 (IPv6) BEFORE 127.0.0.1. The connection to ::1 is
    // refused, so every admin write fails - which looks exactly like
    // "my settings don't save", because a GET served from the cached theme in
    // localStorage still renders the old values.
    //
    // We therefore also listen on ::1 when the operator did not pick an
    // explicit HOST. A second listener is used rather than binding '::'
    // because '::' is an all-interfaces bind, which is what triggered the
    // original `EACCES 0.0.0.0` failure on Windows.
    const alsoBindIpv6Loopback = !process.env.HOST && host === '127.0.0.1';

    httpServer.listen(port, host, () => {
      logger.info(`✅ Server running on http://${host}:${port}`);
      if (alsoBindIpv6Loopback) {
        // net.Server can only listen once, so open a twin server that feeds
        // the same Express app.
        const twin = createServer(app);
        twin.on('error', (err: NodeJS.ErrnoException) => {
          // Not fatal: plenty of machines have IPv6 disabled entirely. IPv4
          // is already serving, so we only note it.
          logger.warn(
            `⚠️  Could not also bind [::1]:${port} (${err.code}). ` +
              'If the admin panel cannot save, set NEXT_PUBLIC_API_URL to ' +
              `http://127.0.0.1:${port}/api in apps/web/.env.local`
          );
        });
        twin.listen(port, '::1', () => {
          logger.info(`✅ Also listening on http://[::1]:${port} (IPv6 loopback)`);
        });
      }
      logger.info(`🌍 Environment: ${env.NODE_ENV}`);
      logger.info(`🔗 API URL: http://localhost:${port}/api`);
      logger.info(`💚 Health check: http://localhost:${port}/health`);
      
      if (env.NODE_ENV === 'development') {
        logger.info(`📊 Prisma Studio: npx prisma studio`);
        logger.info(`📧 MailHog: http://localhost:8025`);
        logger.info(`🗄️ pgAdmin: http://localhost:5050`);
        logger.info(`📦 MinIO Console: http://localhost:9001`);
      }
    });

    // listen() reports failures via an event, not a throw, so the surrounding
    // try/catch never sees EADDRINUSE / EACCES.
    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`❌ Port ${port} is already in use.`);
        logger.error(`   Another process is on ${host}:${port}. Stop it, or set PORT in apps/api/.env`);
      } else if (err.code === 'EACCES') {
        logger.error(`❌ Permission denied binding ${host}:${port}.`);
        logger.error('   On Windows this usually means the port is inside a reserved range.');
        logger.error('   Check:   netsh interface ipv4 show excludedportrange protocol=tcp');
        logger.error('   Fix:     set a different PORT in apps/api/.env (e.g. 4001)');
      } else {
        logger.error('❌ Server error:', err);
      }
      process.exit(1);
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();