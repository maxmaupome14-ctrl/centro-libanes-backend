import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireStaffAuth } from '../middleware/auth';

const router = Router();

// GET /api/staff/me/appointments - today's reservations assigned to this staff member
router.get('/me/appointments', requireStaffAuth, async (req: any, res: any) => {
    const staff = req.staff;
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    try {
        const reservations = await prisma.reservation.findMany({
            where: {
                staff_id: staff.id,
                date: { gte: startOfDay, lt: endOfDay },
                status: { not: 'cancelada' },
            },
            include: {
                profile: { select: { first_name: true, last_name: true } },
                service: { select: { name: true } },
            },
            orderBy: { start_time: 'asc' },
        });

        const appointments = reservations.map(r => ({
            id: r.id,
            service: r.service?.name || 'Servicio',
            client: `${r.profile.first_name} ${r.profile.last_name}`,
            time: new Date(r.start_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }),
            end_time: new Date(r.end_time).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }),
            status: r.status,
        }));

        const confirmed = appointments.filter(a => a.status === 'confirmada').length;
        const pending = appointments.filter(a => a.status !== 'confirmada').length;

        return res.json({ appointments, total: appointments.length, confirmed, pending });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/staff/me/week - appointment counts per weekday for current week (Mon–Sat)
router.get('/me/week', requireStaffAuth, async (req: any, res: any) => {
    const staff = req.staff;
    const today = new Date();

    // Find Monday of current week
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysFromMonday);
    const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);

    try {
        const reservations = await prisma.reservation.findMany({
            where: {
                staff_id: staff.id,
                date: { gte: monday, lt: nextMonday },
                status: { not: 'cancelada' },
            },
            select: { date: true },
        });

        // counts[0]=Mon, counts[1]=Tue, ..., counts[5]=Sat
        const counts = [0, 0, 0, 0, 0, 0];
        for (const r of reservations) {
            const d = new Date(r.date).getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
            const idx = d === 0 ? 6 : d - 1;    // Map to 0=Mon..5=Sat, 6=Sun (ignored)
            if (idx < 6) counts[idx]++;
        }

        return res.json({ counts });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

export default router;
