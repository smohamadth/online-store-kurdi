import { PrismaClient } from '@prisma/client';
import { env, isDevelopment } from './environment';
import { logger } from '../utils/logger';

// Prisma client singleton
let prisma: PrismaClient;

declare global {
  var __prisma: PrismaClient | undefined;
}

if (isDevelopment) {
  // In development, use global variable to prevent multiple instances
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
  }
  prisma = global.__prisma;
} else {
  // In production, create new instance
  prisma = new PrismaClient({
    log: ['error'],
  });
}

// Connect to database
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('✅ Database connected successfully');
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

// Disconnect from database
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('✅ Database disconnected successfully');
  } catch (error) {
    logger.error('❌ Database disconnection failed:', error);
  }
}

// Health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('❌ Database health check failed:', error);
    return false;
  }
}

export { prisma };
export default prisma;