import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Auth middleware - same pattern as reservation routes
const requireAuth = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        const profileId = token.replace('mock_jwt_token_', '');
        const profile = await prisma.memberProfile.findUnique({
            where: { id: profileId },
            include: { membership: true },
        });
        if (!profile) return res.status(401).json({ error: 'Invalid token' });
        req.user = { ...profile, membership_id: profile.membership_id };
        next();
    } catch { return res.status(500).json({ error: 'Auth error' }); }
};

// GET /api/lockers - list lockers for a unit
router.get('/', async (req: any, res: any) => {
    const { unit_name } = req.query;
    try {
        let where: any = {};
        if (unit_name) {
            const unit = await prisma.unit.findFirst({ where: { short_name: { contains: unit_name as string } } });
            if (unit) where.unit_id = unit.id;
        }
        const lockers = await prisma.locker.findMany({
            where,
            include: {
                unit: { select: { short_name: true } },
                rentals: {
                    where: { status: 'activa' },
                    select: { id: true, profile_id: true, quarter: true, end_date: true }
                },
            },
            orderBy: [{ zone: 'asc' }, { number: 'asc' }],
        });

        const result = lockers.map(l => ({
            id: l.id,
            number: l.number,
            zone: l.zone,
            floor: l.floor,
            size: l.size,
            condition: l.condition,
            unit: l.unit.short_name,
            is_available: l.rentals.length === 0,
            current_rental: l.rentals[0] || null,
        }));

        return res.json(result);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/lockers/:id/rent - rent a locker
router.post('/:id/rent', requireAuth, async (req: any, res: any) => {
    const { id } = req.params;
    const user = req.user;

    try {
        const locker = await prisma.locker.findUnique({ where: { id } });
        if (!locker) return res.status(404).json({ error: 'Locker no encontrado' });
        if (locker.condition !== 'operativo') return res.status(400).json({ error: 'Locker no disponible' });

        // Check if already rented this quarter
        const now = new Date();
        const currentQ = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
        const existing = await prisma.lockerRental.findFirst({
            where: { locker_id: id, status: 'activa' },
        });
        if (existing) return res.status(400).json({ error: 'Este locker ya está rentado' });

        // Price based on size
        const prices: Record<string, number> = { chico: 400, mediano: 600, grande: 800 };
        const price = prices[locker.size] || 500;

        // End of current quarter
        const qEnd = new Date(now.getFullYear(), Math.ceil((now.getMonth() + 1) / 3) * 3, 0);

        const rental = await prisma.lockerRental.create({
            data: {
                locker_id: id,
                membership_id: user.membership_id,
                profile_id: user.id,
                quarter: currentQ,
                start_date: now,
                end_date: qEnd,
                price,
                status: 'activa',
                auto_renew: true,
            },
            include: { locker: true },
        });

        return res.status(201).json({
            ...rental,
            message: `Locker ${locker.number} rentado exitosamente`,
        });
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/lockers/:id/release - release a locker
router.post('/:id/release', requireAuth, async (req: any, res: any) => {
    const { id } = req.params;
    const user = req.user;

    try {
        const rental = await prisma.lockerRental.findFirst({
            where: { locker_id: id, profile_id: user.id, status: 'activa' },
        });
        if (!rental) return res.status(404).json({ error: 'No tienes este locker rentado' });

        await prisma.lockerRental.update({
            where: { id: rental.id },
            data: { status: 'cancelada', auto_renew: false },
        });

        return res.json({ message: 'Locker liberado exitosamente' });
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// GET /api/lockers/my - get my rented lockers
router.get('/my', requireAuth, async (req: any, res: any) => {
    const user = req.user;
    try {
        const rentals = await prisma.lockerRental.findMany({
            where: { profile_id: user.id, status: 'activa' },
            include: {
                locker: { include: { unit: { select: { short_name: true } } } },
            },
        });
        return res.json(rentals);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

export default router;
