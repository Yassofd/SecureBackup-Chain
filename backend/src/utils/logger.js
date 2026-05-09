'use strict';
const path = require('path');
const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');

const LOG_DIR = path.resolve(__dirname, '../../../logs');

const jsonFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  format.errors({ stack: true }),
  format.json(),
);

const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.printf(({ timestamp, level, message, ...meta }) => {
    const extras = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `${timestamp} [${level}] ${message}${extras}`;
  }),
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: jsonFormat,
  transports: [
    // Console (dev-friendly)
    new transports.Console({ format: consoleFormat }),

    // Fichier tournant quotidien — tous niveaux
    new transports.DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true,
    }),

    // Fichier dédié aux erreurs
    new transports.DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '10m',
      maxFiles: '90d',
      zippedArchive: true,
    }),
  ],
});

module.exports = logger;
