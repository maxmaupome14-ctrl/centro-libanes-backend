import { PrismaClient } from '@prisma/client';

// Singleton PrismaClient to avoid multiple connections
const prisma = new PrismaClient();

export default prisma;
