import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'centro-libanes-secret-key-2024';

export const requireAuth = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;

        const profile = await prisma.memberProfile.findUnique({
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

        let permissions: any = {};
        try {
            permissions = typeof profile.permissions === 'string'
                ? JSON.parse(profile.permissions)
                : profile.permissions;
        } catch {
            permissions = {};
        }

        req.user = { ...profile, membership_id: profile.membership_id, parsedPermissions: permissions };
        next();
    } catch (e: any) {
        if (e.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expirado' });
        if (e.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Token inválido' });
        return res.status(500).json({ error: 'Auth error: ' + e.message });
    }
};

export const requireStaffAuth = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;

        if (decoded.type !== 'staff') {
            return res.status(401).json({ error: 'Token de staff inválido' });
        }

        const staff = await prisma.staff.findUnique({
            where: { id: decoded.id },
            include: { unit: true },
        });

        if (!staff || !staff.is_active) {
            return res.status(401).json({ error: 'Staff inactivo o no encontrado' });
        }

        req.staff = staff;
        next();
    } catch (e: any) {
        if (e.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expirado' });
        if (e.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Token inválido' });
        return res.status(500).json({ error: 'Auth error' });
    }
};
