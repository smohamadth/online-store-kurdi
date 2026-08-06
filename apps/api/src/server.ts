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
    
    httpServer.listen(port, () => {
      logger.info(`✅ Server running on port ${port}`);
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

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();