import prisma from '../lib/prisma';

/**
 * Member auth middleware - extracts profile from mock JWT token.
 * Token format: "mock_jwt_token_PROFILE_ID"
 */
export const requireAuth = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const profileId = token.replace('mock_jwt_token_', '');
        const profile = await prisma.memberProfile.findUnique({
            where: { id: profileId },
            include: { membership: true },
        });

        if (!profile || !profile.is_active) {
            return res.status(401).json({ error: 'Invalid or inactive token' });
        }

        if (profile.membership.status !== 'activa') {
            return res.status(403).json({
                error: 'suspension',
                message: 'Tu membresía está suspendida. Regulariza tu mantenimiento.'
            });
        }

        // Parse permissions from JSON string
        let permissions: any = {};
        try {
            permissions = typeof profile.permissions === 'string'
                ? JSON.parse(profile.permissions)
                : profile.permissions;
        } catch {
            permissions = {};
        }

        req.user = {
            ...profile,
            membership_id: profile.membership_id,
            parsedPermissions: permissions,
        };
        next();
    } catch (e: any) {
        return res.status(500).json({ error: 'Auth error: ' + e.message });
    }
};

/**
 * Staff auth middleware.
 * Token format: "staff_token_STAFFID_TIMESTAMP"
 */
export const requireStaffAuth = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
        const withoutPrefix = token.replace('staff_token_', '');
        // Staff ID is everything except the last segment (timestamp)
        const parts = withoutPrefix.split('_');
        const staffId = parts.length > 1 ? parts.slice(0, -1).join('_') : parts[0];

        const staff = await prisma.staff.findUnique({
            where: { id: staffId },
            include: { unit: true },
        });

        if (!staff || !staff.is_active) {
            return res.status(401).json({ error: 'Invalid staff token' });
        }

        req.staff = staff;
        next();
    } catch {
        return res.status(500).json({ error: 'Auth error' });
    }
};
