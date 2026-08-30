// ---------------------------------------------------------------------------
// Winston logger: the app's single logging surface.
//
// JSON to console + rolling files (logs/app.log, logs/error.log), each
// file capped at 5MB x 5 rotations. Level comes from LOG_LEVEL. The
// `log.*` helpers below are thin structured wrappers used by the services
// (auth, business, performance events); everything else calls logger.*
// directly. Import { logger } from here - never create a second winston
// instance, or the two streams will interleave confusingly in the files.
// ---------------------------------------------------------------------------
import winston from 'winston';
import { env, isDevelopment } from '../config/environment';

// JSON line format - machine-parseable for log shippers; humans read the
// dev console format below instead.
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: logFormat,
  defaultMeta: { service: 'store-api' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: isDevelopment ? consoleFormat : logFormat,
    }),
    
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: env.LOG_FILE,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Stream adapter so morgan's HTTP access log flows into winston (one
// place to filter/rotate) instead of its own console output.
export const loggerStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

// Helper functions for structured logging
export const log = {
  error: (message: string, meta?: any) => {
    logger.error(message, meta);
  },
  
  warn: (message: string, meta?: any) => {
    logger.warn(message, meta);
  },
  
  info: (message: string, meta?: any) => {
    logger.info(message, meta);
  },
  
  debug: (message: string, meta?: any) => {
    logger.debug(message, meta);
  },
  
  // HTTP request logging
  request: (req: any, res: any, responseTime: number) => {
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    });
  },
  
  // Database query logging
  query: (query: string, duration: number) => {
    logger.debug('Database Query', {
      query,
      duration: `${duration}ms`,
    });
  },
  
  // Authentication logging
  auth: (action: string, userId?: string, meta?: any) => {
    logger.info('Auth Event', {
      action,
      userId,
      ...meta,
    });
  },
  
  // Business logic logging
  business: (action: string, meta?: any) => {
    logger.info('Business Event', {
      action,
      ...meta,
    });
  },
  
  // Performance logging
  performance: (operation: string, duration: number, meta?: any) => {
    logger.info('Performance', {
      operation,
      duration: `${duration}ms`,
      ...meta,
    });
  },
};

export default logger;