import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Simplified auth middleware — extracts profile from token
const requireAuth = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        // Token format: "mock_jwt_token_PROFILE_ID" or just the profile ID
        const profileId = token.replace('mock_jwt_token_', '');

        const profile = await prisma.memberProfile.findUnique({
            where: { id: profileId },
            include: { membership: true },
        });

        if (!profile) {
            // Might be a staff token — skip auth for staff
            return res.status(401).json({ error: 'Invalid token — use member login' });
        }

        req.user = {
            ...profile,
            membership_id: profile.membership_id,
        };
        next();
    } catch (e: any) {
        return res.status(500).json({ error: 'Auth error: ' + e.message });
    }
};

// GET /api/reservations/user
router.get('/user', requireAuth, async (req: any, res: any) => {
    try {
        const user = req.user;
        const reservations = await prisma.reservation.findMany({
            where: {
                profile_id: user.id,
                date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
                status: { in: ['confirmada', 'pendiente_aprobacion'] }
            },
            include: { service: true },
            orderBy: [{ date: 'asc' }, { start_time: 'asc' }],
            take: 10,
        });
        return res.json(reservations);
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/reservations/book
router.post('/book', requireAuth, async (req: any, res: any) => {
    const { service_id, resource_id, date, start_time, end_time, price, unit_name } = req.body;
    const user = req.user;

    if (!date || !start_time || !end_time) {
        return res.status(400).json({ error: 'Missing date, start_time, or end_time' });
    }

    try {
        // 1. Resolve unit_id from the service/resource or from the request
        let resolvedUnitId: string | null = null;

        if (service_id) {
            // Look up the service to find unit_id
            const svc = await prisma.service.findUnique({ where: { id: service_id } });
            if (svc) resolvedUnitId = svc.unit_id;
        }
        if (!resolvedUnitId && resource_id) {
            const res = await prisma.resource.findUnique({ where: { id: resource_id } });
            if (res) resolvedUnitId = res.unit_id;
        }
        if (!resolvedUnitId) {
            // Try to find from activity (since catalog returns activities too)
            if (service_id) {
                const act = await prisma.activity.findUnique({ where: { id: service_id } });
                if (act) resolvedUnitId = act.unit_id;
            }
        }
        if (!resolvedUnitId) {
            // Fallback: get first unit
            const unit = await prisma.unit.findFirst();
            resolvedUnitId = unit?.id || '';
        }

        // 2. Check if user is a minor (requires approval)
        const isMinor = user.is_minor === true;
        const initialStatus = isMinor ? 'pendiente_aprobacion' : 'confirmada';

        // 3. Create Reservation
        const newReservation = await prisma.reservation.create({
            data: {
                unit_id: resolvedUnitId,
                profile_id: user.id,
                membership_id: user.membership_id,
                booked_by_id: user.id,
                service_id: service_id || undefined,
                resource_id: resource_id || undefined,
                date: new Date(date),
                start_time: new Date(`${date}T${start_time}:00`),
                end_time: new Date(`${date}T${end_time}:00`),
                status: initialStatus,
                requires_approval: isMinor,
            },
            include: { service: true },
        });

        return res.status(201).json({
            ...newReservation,
            message: isMinor
                ? 'Reserva pendiente de aprobación del titular'
                : '¡Reserva confirmada!'
        });
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/reservations/:id/cancel
router.post('/:id/cancel', requireAuth, async (req: any, res: any) => {
    try {
        const user = req.user;
        const reservation = await prisma.reservation.findUnique({ where: { id: req.params.id } });

        if (!reservation) return res.status(404).json({ error: 'Reservación no encontrada' });
        if (reservation.profile_id !== user.id) return res.status(403).json({ error: 'No autorizado' });

        const updated = await prisma.reservation.update({
            where: { id: req.params.id },
            data: { status: 'cancelada' },
        });

        return res.json({ ...updated, message: 'Reservación cancelada' });
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/approvals/:id/approve
router.post('/approvals/:id/approve', requireAuth, async (req: any, res: any) => {
    try {
        const updated = await prisma.reservation.update({
            where: { id: req.params.id },
            data: { status: 'confirmada', approved_by_id: req.user.id, approved_at: new Date() },
        });
        return res.json(updated);
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/approvals/:id/reject
router.post('/approvals/:id/reject', requireAuth, async (req: any, res: any) => {
    try {
        const updated = await prisma.reservation.update({
            where: { id: req.params.id },
            data: { status: 'rechazada', approved_by_id: req.user.id, approved_at: new Date() },
        });
        return res.json(updated);
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

export default router;
