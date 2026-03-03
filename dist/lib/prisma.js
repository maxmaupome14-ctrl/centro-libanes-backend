"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
// Singleton PrismaClient to avoid multiple connections
const prisma = new client_1.PrismaClient();
exports.default = prisma;
