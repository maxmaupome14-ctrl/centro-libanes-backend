import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /api/enrollments/my - current user's activity enrollments
router.get('/my', requireAuth, async (req: any, res: any) => {
    const user = req.user;

    try {
        const enrollments = await prisma.activityEnrollment.findMany({
            where: { profile_id: user.id, status: 'activa' },
            include: {
                activity: {
                    include: {
                        schedules: true,
                        unit: { select: { short_name: true } },
                        instructor: { select: { name: true } },
                    }
                }
            }
        });

        return res.json(enrollments.map(e => ({
            id: e.id,
            activity_id: e.activity_id,
            activity_name: e.activity.name,
            category: e.activity.category,
            unit: e.activity.unit.short_name,
            instructor: e.activity.instructor?.name || null,
            price_monthly: Number(e.activity.price_monthly || 0),
            included_in_membership: e.activity.included_in_membership,
            schedules: e.activity.schedules.map(s => ({
                day: s.day_of_week,
                start: s.start_time,
                end: s.end_time,
            })),
            enrolled_at: e.enrolled_at,
            status: e.status,
        })));
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/enrollments - enroll in an activity
router.post('/', requireAuth, async (req: any, res: any) => {
    const { activity_id } = req.body;
    const user = req.user;

    if (!activity_id) {
        return res.status(400).json({ error: 'activity_id es requerido' });
    }

    try {
        const activity = await prisma.activity.findUnique({
            where: { id: activity_id },
            include: { enrollments: { where: { status: 'activa' } } }
        });

        if (!activity || !activity.is_active) {
            return res.status(404).json({ error: 'Actividad no encontrada o inactiva' });
        }

        // Check capacity
        if (activity.max_capacity && activity.enrollments.length >= activity.max_capacity) {
            return res.status(400).json({ error: 'Actividad llena, no hay cupo disponible' });
        }

        // Check age requirements
        if (activity.min_age || activity.max_age) {
            const dob = new Date(user.date_of_birth);
            const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

            if (activity.min_age && age < activity.min_age) {
                return res.status(400).json({ error: `Edad mínima: ${activity.min_age} años` });
            }
            if (activity.max_age && age > activity.max_age) {
                return res.status(400).json({ error: `Edad máxima: ${activity.max_age} años` });
            }
        }

        // Check if already enrolled
        const existing = await prisma.activityEnrollment.findFirst({
            where: { activity_id, profile_id: user.id, status: 'activa' }
        });
        if (existing) {
            return res.status(400).json({ error: 'Ya estás inscrito en esta actividad' });
        }

        const now = new Date();
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const enrollment = await prisma.activityEnrollment.create({
            data: {
                activity_id,
                profile_id: user.id,
                membership_id: user.membership_id,
                status: 'activa',
                period,
            },
            include: {
                activity: { select: { name: true } }
            }
        });

        return res.status(201).json({
            ...enrollment,
            message: `Inscrito en ${enrollment.activity.name}`
        });
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// DELETE /api/enrollments/:id - cancel enrollment
router.delete('/:id', requireAuth, async (req: any, res: any) => {
    const { id } = req.params;
    const user = req.user;

    try {
        const enrollment = await prisma.activityEnrollment.findUnique({
            where: { id },
            include: { activity: { select: { name: true } } }
        });

        if (!enrollment) return res.status(404).json({ error: 'Inscripción no encontrada' });
        if (enrollment.profile_id !== user.id) {
            return res.status(403).json({ error: 'No autorizado' });
        }

        await prisma.activityEnrollment.update({
            where: { id },
            data: { status: 'cancelada' }
        });

        return res.json({ message: `Inscripción a ${enrollment.activity.name} cancelada` });
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

export default router;
