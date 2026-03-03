"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireStaffAuth = exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const JWT_SECRET = process.env.JWT_SECRET || 'centro-libanes-secret-key-2024';
const requireAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    if (!token)
        return res.status(401).json({ error: 'No token provided' });
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const profile = await prisma_1.default.memberProfile.findUnique({
            where: { id: decoded.id },
            include: { membership: true },
        });
        if (!profile || !profile.is_active) {
            return res.status(401).json({ error: 'Token inválido o perfil inactivo' });
        }
        if (profile.membership.status !== 'activa') {
            return res.status(403).json({
                error: 'suspension',
                message: 'Tu membresía está suspendida. Regulariza tu mantenimiento.'
            });
        }
        let permissions = {};
        try {
            permissions = typeof profile.permissions === 'string'
                ? JSON.parse(profile.permissions)
                : profile.permissions;
        }
        catch {
            permissions = {};
        }
        req.user = { ...profile, membership_id: profile.membership_id, parsedPermissions: permissions };
        next();
    }
    catch (e) {
        if (e.name === 'TokenExpiredError')
            return res.status(401).json({ error: 'Token expirado' });
        if (e.name === 'JsonWebTokenError')
            return res.status(401).json({ error: 'Token inválido' });
        return res.status(500).json({ error: 'Auth error: ' + e.message });
    }
};
exports.requireAuth = requireAuth;
const requireStaffAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    if (!token)
        return res.status(401).json({ error: 'No token' });
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (decoded.type !== 'staff') {
            return res.status(401).json({ error: 'Token de staff inválido' });
        }
        const staff = await prisma_1.default.staff.findUnique({
            where: { id: decoded.id },
            include: { unit: true },
        });
        if (!staff || !staff.is_active) {
            return res.status(401).json({ error: 'Staff inactivo o no encontrado' });
        }
        req.staff = staff;
        next();
    }
    catch (e) {
        if (e.name === 'TokenExpiredError')
            return res.status(401).json({ error: 'Token expirado' });
        if (e.name === 'JsonWebTokenError')
            return res.status(401).json({ error: 'Token inválido' });
        return res.status(500).json({ error: 'Auth error' });
    }
};
exports.requireStaffAuth = requireStaffAuth;
