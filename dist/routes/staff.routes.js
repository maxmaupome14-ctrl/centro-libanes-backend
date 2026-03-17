"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../lib/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/staff?unit_name=...&service_id=... - public list of active staff
// If service_id is provided, returns only staff linked to that service via StaffService
// If only unit_name, returns all active staff in that unit
router.get('/', async (req, res) => {
    try {
        const { unit_name, service_id } = req.query;
        const where = { is_active: true };
        if (service_id) {
            // Filter by service — uses the StaffService join table
            where.services = { some: { service_id: service_id } };
        }
        else if (unit_name) {
            const unit = await prisma_1.default.unit.findFirst({
                where: { name: { contains: unit_name, mode: 'insensitive' } },
            });
            if (unit)
                where.unit_id = unit.id;
            else
                return res.json([]);
        }
        const staff = await prisma_1.default.staff.findMany({
            where,
            select: { id: true, name: true, role: true, unit: { select: { name: true, short_name: true } } },
            orderBy: { name: 'asc' },
        });
        return res.json(staff);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/staff/me/appointments - today's reservations assigned to this staff member
router.get('/me/appointments', auth_1.requireStaffAuth, async (req, res) => {
    const staff = req.staff;
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    try {
        const reservations = await prisma_1.default.reservation.findMany({
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
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/staff/me/week - appointment counts per weekday for current week (Mon–Sat)
router.get('/me/week', auth_1.requireStaffAuth, async (req, res) => {
    const staff = req.staff;
    const today = new Date();
    // Find Monday of current week
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysFromMonday);
    const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
    try {
        const reservations = await prisma_1.default.reservation.findMany({
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
            const idx = d === 0 ? 6 : d - 1; // Map to 0=Mon..5=Sat, 6=Sun (ignored)
            if (idx < 6)
                counts[idx]++;
        }
        return res.json({ counts });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/staff/me/earnings - current month earnings & settlement history
router.get('/me/earnings', auth_1.requireStaffAuth, async (req, res) => {
    const staff = req.staff;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    try {
        const staffRecord = await prisma_1.default.staff.findUnique({
            where: { id: staff.id },
            select: { commission_rate: true, fixed_rent: true, employment_type: true },
        });
        if (!staffRecord)
            return res.status(404).json({ error: 'Staff no encontrado' });
        // Completed reservations this month
        const reservations = await prisma_1.default.reservation.findMany({
            where: {
                staff_id: staff.id,
                status: 'completada',
                date: { gte: startOfMonth, lte: endOfMonth },
            },
            include: {
                service: { select: { name: true, price: true } },
                profile: { select: { first_name: true, last_name: true } },
            },
            orderBy: { date: 'desc' },
        });
        const grossRevenue = reservations.reduce((sum, r) => sum + Number(r.service?.price || 0), 0);
        const rate = staffRecord.commission_rate ? Number(staffRecord.commission_rate) : 0;
        const fixedRent = staffRecord.fixed_rent ? Number(staffRecord.fixed_rent) : 0;
        let staffPayout = 0;
        let clubCut = 0;
        if (fixedRent > 0) {
            clubCut = fixedRent;
            staffPayout = grossRevenue - fixedRent;
        }
        else if (rate > 0) {
            staffPayout = grossRevenue * rate;
            clubCut = grossRevenue - staffPayout;
        }
        // Recent settlements
        const settlements = await prisma_1.default.staffSettlement.findMany({
            where: { staff_id: staff.id },
            orderBy: { created_at: 'desc' },
            take: 6,
        });
        const services = reservations.map(r => ({
            id: r.id,
            service: r.service?.name || 'Servicio',
            client: `${r.profile.first_name} ${r.profile.last_name}`,
            price: Number(r.service?.price || 0),
            date: r.date,
        }));
        return res.json({
            employment_type: staffRecord.employment_type,
            commission_rate: rate,
            fixed_rent: fixedRent,
            period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
            month_services: reservations.length,
            month_gross: grossRevenue,
            month_club_cut: clubCut,
            month_payout: staffPayout,
            services,
            settlements: settlements.map(s => ({
                id: s.id,
                period_start: s.period_start,
                period_end: s.period_end,
                total_services: s.total_services,
                gross_revenue: Number(s.gross_revenue),
                staff_payout: Number(s.staff_payout),
                status: s.status,
                paid_at: s.paid_at,
            })),
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PATCH /api/staff/me/appointments/:id/status - update reservation status (complete, no-show)
router.patch('/me/appointments/:id/status', auth_1.requireStaffAuth, async (req, res) => {
    const staff = req.staff;
    const { status } = req.body;
    const allowed = ['completada', 'no_show', 'confirmada'];
    if (!allowed.includes(status)) {
        return res.status(400).json({ error: `Estado inválido. Opciones: ${allowed.join(', ')}` });
    }
    try {
        const reservation = await prisma_1.default.reservation.findUnique({ where: { id: req.params.id } });
        if (!reservation || reservation.staff_id !== staff.id) {
            return res.status(404).json({ error: 'Cita no encontrada' });
        }
        if (['cancelada', 'completada', 'no_show'].includes(reservation.status)) {
            return res.status(400).json({ error: 'Esta cita ya no puede modificarse' });
        }
        const updated = await prisma_1.default.reservation.update({
            where: { id: req.params.id },
            data: { status },
        });
        return res.json({ id: updated.id, status: updated.status });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
