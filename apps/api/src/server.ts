import { httpServer } from './app';
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

    httpServer.listen(port, host, () => {
      logger.info(`✅ Server running on http://${host}:${port}`);
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