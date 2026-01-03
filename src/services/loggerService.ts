/**
 * Logger Service
 *
 * Provides structured JSON logging for production with Winston.
 * Supports multiple transports, log rotation, and contextual metadata.
 */

import winston from 'winston';
import 'winston-daily-rotate-file';
import { configManager } from './configService';
import path from 'path';
import fs from 'fs';

// Ensure the log directory exists
const logDirectory = path.dirname(configManager.config.log_path);
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

// Get environment variables
const NODE_ENV = process.env.NODE_ENV || 'development';
const SERVICE_NAME = 'alcs';
const SERVICE_VERSION = '1.0.0';

/**
 * Structured JSON format for production logs
 * Includes service metadata, timestamps, and contextual information
 */
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata(),
  winston.format.json(),
  winston.format.printf(info => {
    const log: any = {
      timestamp: info.timestamp,
      level: info.level,
      message: info.message,
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      environment: NODE_ENV,
    };

    // Add stack trace for errors
    if (info.stack) {
      log.stack = info.stack;
    }

    // Add metadata if present
    if (info.metadata && Object.keys(info.metadata).length > 0) {
      Object.assign(log, info.metadata);
    }

    return JSON.stringify(log);
  })
);

/**
 * Human-readable format for development console
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(info => {
    const metadata = info.metadata && Object.keys(info.metadata).length > 0
      ? ` ${JSON.stringify(info.metadata)}`
      : '';
    return `${info.timestamp} ${info.level}: ${info.message}${metadata}`;
  })
);

/**
 * Create Winston logger instance
 */
const logger = winston.createLogger({
  level: configManager.config.log_level,
  defaultMeta: {
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    environment: NODE_ENV,
  },
  transports: [
    // Console transport (human-readable in dev, JSON in production)
    new winston.transports.Console({
      format: NODE_ENV === 'production' ? jsonFormat : consoleFormat,
    }),
    // File transport for all logs (JSON format)
    new winston.transports.DailyRotateFile({
      filename: path.join(logDirectory, 'alcs-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: process.env.LOG_FILE_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_FILE_MAX_FILES || '14d',
      level: configManager.config.log_level,
      format: jsonFormat,
    }),
    // Separate file for errors (JSON format)
    new winston.transports.DailyRotateFile({
      filename: path.join(logDirectory, 'alcs-errors-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error',
      format: jsonFormat,
    }),
  ],
  exceptionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDirectory, 'alcs-exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: jsonFormat,
    }),
  ],
  rejectionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDirectory, 'alcs-rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: jsonFormat,
    }),
  ],
});

/**
 * Create a child logger with additional context
 * Useful for adding request IDs, session IDs, etc.
 */
export function createChildLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Log with additional structured context
 */
export function logWithContext(
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  context?: Record<string, any>
) {
  logger.log(level, message, context);
}

export { logger };
