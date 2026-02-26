import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { checkSpendingLimit } from '../services/reservation.service';

const router = Router();

// GET /api/reservations/user - upcoming reservations for current profile
router.get('/user', requireAuth, async (req: any, res: any) => {
    try {
        const user = req.user;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const reservations = await prisma.reservation.findMany({
            where: {
                profile_id: user.id,
                date: { gte: today },
                status: { in: ['confirmada', 'pendiente', 'pendiente_aprobacion', 'en_curso'] }
            },
            include: {
                service: { select: { name: true, category: true, duration_minutes: true } },
                unit: { select: { short_name: true } },
            },
            orderBy: [{ date: 'asc' }, { start_time: 'asc' }],
            take: 20,
        });

        return res.json(reservations);
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// GET /api/reservations/pending-approvals - for titular/conyugue
router.get('/pending-approvals', requireAuth, async (req: any, res: any) => {
    try {
        const user = req.user;
        const permissions = user.parsedPermissions;

        if (!permissions.can_approve_reservations) {
            return res.status(403).json({ error: 'No tienes permiso para ver aprobaciones' });
        }

        const pending = await prisma.reservation.findMany({
            where: {
                membership_id: user.membership_id,
                status: 'pendiente_aprobacion',
            },
            include: {
                profile: { select: { first_name: true, last_name: true, role: true } },
                service: { select: { name: true, category: true } },
                unit: { select: { short_name: true } },
            },
            orderBy: { created_at: 'desc' },
        });

        return res.json(pending);
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/reservations/book
router.post('/book', requireAuth, async (req: any, res: any) => {
    const { service_id, resource_id, date, start_time, end_time } = req.body;
    const user = req.user;
    const permissions = user.parsedPermissions;

    if (!date || !start_time || !end_time) {
        return res.status(400).json({ error: 'Faltan date, start_time o end_time' });
    }

    try {
        // 1. Check permission based on service category
        if (service_id) {
            const svc = await prisma.service.findUnique({ where: { id: service_id } });
            if (svc) {
                const cat = svc.category;
                if (cat === 'spa' && permissions.can_book_spa === false) {
                    return res.status(403).json({ error: 'No tienes permiso para reservar spa' });
                }
                if (cat === 'barberia' && permissions.can_book_barberia === false) {
                    return res.status(403).json({ error: 'No tienes permiso para reservar barbería' });
                }
            }
        }
        if (resource_id && permissions.can_book_deportes === false) {
            return res.status(403).json({ error: 'No tienes permiso para reservar deportes' });
        }

        // 2. Check allowed hours for minors
        if (permissions.allowed_hours_start && permissions.allowed_hours_end) {
            const [startH] = start_time.split(':').map(Number);
            const [allowStart] = permissions.allowed_hours_start.split(':').map(Number);
            const [allowEnd] = permissions.allowed_hours_end.split(':').map(Number);

            if (startH < allowStart || startH >= allowEnd) {
                return res.status(403).json({
                    error: `Solo puedes reservar entre ${permissions.allowed_hours_start} y ${permissions.allowed_hours_end}`
                });
            }
        }

        // 3. Check max active reservations
        if (permissions.max_active_reservations) {
            const activeCount = await prisma.reservation.count({
                where: {
                    profile_id: user.id,
                    status: { in: ['confirmada', 'pendiente', 'pendiente_aprobacion'] },
                    date: { gte: new Date() },
                }
            });

            if (activeCount >= permissions.max_active_reservations) {
                return res.status(403).json({
                    error: `Máximo ${permissions.max_active_reservations} reservas activas permitidas`
                });
            }
        }

        // 4. Check spending limit
        if (permissions.spending_limit_monthly != null) {
            const svc = service_id
                ? await prisma.service.findUnique({ where: { id: service_id } })
                : null;
            const price = svc ? Number(svc.price) : 0;
            if (price > 0) {
                await checkSpendingLimit(user.id, user.membership_id, price);
            }
        }

        // 5. Resolve unit_id
        let resolvedUnitId: string | null = null;
        if (service_id) {
            const svc = await prisma.service.findUnique({ where: { id: service_id } });
            if (svc) resolvedUnitId = svc.unit_id;
        }
        if (!resolvedUnitId && resource_id) {
            const resource = await prisma.resource.findUnique({ where: { id: resource_id } });
            if (resource) resolvedUnitId = resource.unit_id;
        }
        if (!resolvedUnitId && service_id) {
            const act = await prisma.activity.findUnique({ where: { id: service_id } });
            if (act) resolvedUnitId = act.unit_id;
        }
        if (!resolvedUnitId) {
            const unit = await prisma.unit.findFirst();
            resolvedUnitId = unit?.id || '';
        }

        // 6. Determine if approval is needed
        const needsApproval = permissions.requires_approval === true;
        const initialStatus = needsApproval ? 'pendiente_aprobacion' : 'confirmada';

        // 7. Create reservation
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
                requires_approval: needsApproval,
            },
            include: { service: true, unit: { select: { short_name: true } } },
        });

        return res.status(201).json({
            ...newReservation,
            message: needsApproval
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

        const canCancel = reservation.profile_id === user.id
            || (reservation.membership_id === user.membership_id
                && (user.role === 'titular' || user.role === 'conyugue'));

        if (!canCancel) return res.status(403).json({ error: 'No autorizado para cancelar' });

        if (['cancelada', 'completada', 'expirada'].includes(reservation.status)) {
            return res.status(400).json({ error: 'Esta reservación ya no puede cancelarse' });
        }

        const updated = await prisma.reservation.update({
            where: { id: req.params.id },
            data: {
                status: 'cancelada',
                cancelled_at: new Date(),
                cancellation_reason: req.body.reason || 'Cancelada por el usuario',
            },
        });

        return res.json({ ...updated, message: 'Reservación cancelada' });
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/reservations/approvals/:id/approve
router.post('/approvals/:id/approve', requireAuth, async (req: any, res: any) => {
    try {
        const user = req.user;
        const permissions = user.parsedPermissions;

        if (!permissions.can_approve_reservations) {
            return res.status(403).json({ error: 'No tienes permiso para aprobar reservas' });
        }

        const reservation = await prisma.reservation.findUnique({ where: { id: req.params.id } });
        if (!reservation || reservation.status !== 'pendiente_aprobacion') {
            return res.status(400).json({ error: 'Reserva no válida para aprobación' });
        }
        if (reservation.membership_id !== user.membership_id) {
            return res.status(403).json({ error: 'Esta reserva no pertenece a tu familia' });
        }

        const updated = await prisma.reservation.update({
            where: { id: req.params.id },
            data: {
                status: 'confirmada',
                approved_by_id: user.id,
                approved_at: new Date(),
            },
        });

        return res.json({ ...updated, message: 'Reserva aprobada' });
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/reservations/approvals/:id/reject
router.post('/approvals/:id/reject', requireAuth, async (req: any, res: any) => {
    try {
        const user = req.user;
        const permissions = user.parsedPermissions;

        if (!permissions.can_approve_reservations) {
            return res.status(403).json({ error: 'No tienes permiso para rechazar reservas' });
        }

        const reservation = await prisma.reservation.findUnique({ where: { id: req.params.id } });
        if (!reservation || reservation.status !== 'pendiente_aprobacion') {
            return res.status(400).json({ error: 'Reserva no válida para rechazo' });
        }
        if (reservation.membership_id !== user.membership_id) {
            return res.status(403).json({ error: 'Esta reserva no pertenece a tu familia' });
        }

        const updated = await prisma.reservation.update({
            where: { id: req.params.id },
            data: {
                status: 'rechazada',
                approved_by_id: user.id,
                approved_at: new Date(),
                cancellation_reason: req.body.reason || 'Rechazada por el administrador familiar',
            },
        });

        return res.json({ ...updated, message: 'Reserva rechazada' });
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

export default router;
