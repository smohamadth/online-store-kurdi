// Prisma client singleton. Every module imports `prisma` from here, so
// this file is the one place the connection pool is owned.
import { PrismaClient } from '@prisma/client';
import { env, isDevelopment } from './environment';
import { logger } from '../utils/logger';

// Prisma client singleton
let prisma: PrismaClient;

declare global {
  var __prisma: PrismaClient | undefined;
}

if (isDevelopment) {
  // In development, use global variable to prevent multiple instances.
  // tsx watch reloads this module on every file change; without the
  // global each reload would open a fresh connection pool and the old
  // ones would linger (eventually exhausting the database's connection
  // limit). Production is a single load, so a plain instance is fine.
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      // Verbose in dev: every SQL statement is logged, which is how most
      // "why is this endpoint slow" questions get answered here.
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

// Health check - the /health endpoint's database half.
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