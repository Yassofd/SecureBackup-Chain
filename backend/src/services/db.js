'use strict';
const { PrismaClient } = require('@prisma/client');

const db = global.__prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__prisma = db;

module.exports = db;
