"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = (0, express_1.Router)();
// GET /api/admin/staff
router.get('/staff', async (req, res) => {
    try {
        const { unit_id } = req.query;
        let where = {};
        if (unit_id)
            where.unit_id = unit_id;
        const staff = await prisma_1.default.staff.findMany({
            where,
            include: {
                unit: { select: { short_name: true, name: true } },
                services: { include: { service: { select: { id: true, name: true, category: true } } } },
            },
            orderBy: { name: 'asc' },
        });
        return res.json(staff);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/admin/staff
router.post('/staff', async (req, res) => {
    const { name, role, employment_type, unit_id, phone, commission_rate, fixed_rent } = req.body;
    if (!name || !role || !employment_type || !unit_id) {
        return res.status(400).json({ error: 'name, role, employment_type y unit_id son requeridos' });
    }
    try {
        const unit = await prisma_1.default.unit.findUnique({ where: { id: unit_id } });
        if (!unit)
            return res.status(404).json({ error: 'Unidad no encontrada' });
        const staff = await prisma_1.default.staff.create({
            data: {
                name,
                role,
                employment_type,
                unit_id,
                phone: phone || null,
                commission_rate: commission_rate || null,
                fixed_rent: fixed_rent || null,
                is_active: true,
            },
            include: { unit: { select: { short_name: true } } },
        });
        return res.status(201).json({ ...staff, message: `Empleado ${name} registrado` });
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// PATCH /api/admin/staff/:id
router.patch('/staff/:id', async (req, res) => {
    const { id } = req.params;
    const { name, role, employment_type, phone, is_active, commission_rate, fixed_rent } = req.body;
    try {
        const updateData = {};
        if (name !== undefined)
            updateData.name = name;
        if (role !== undefined)
            updateData.role = role;
        if (employment_type !== undefined)
            updateData.employment_type = employment_type;
        if (phone !== undefined)
            updateData.phone = phone;
        if (is_active !== undefined)
            updateData.is_active = is_active;
        if (commission_rate !== undefined)
            updateData.commission_rate = commission_rate;
        if (fixed_rent !== undefined)
            updateData.fixed_rent = fixed_rent;
        const staff = await prisma_1.default.staff.update({
            where: { id },
            data: updateData,
            include: { unit: { select: { short_name: true } } },
        });
        return res.json(staff);
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// DELETE /api/admin/staff/:id
router.delete('/staff/:id', async (req, res) => {
    try {
        await prisma_1.default.staff.update({
            where: { id: req.params.id },
            data: { is_active: false },
        });
        return res.json({ message: 'Empleado desactivado' });
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// GET /api/admin/staff/:id/services — available services for this staff's unit + assigned ones
router.get('/staff/:id/services', async (req, res) => {
    try {
        const staff = await prisma_1.default.staff.findUnique({
            where: { id: req.params.id },
            include: { services: { select: { service_id: true } } },
        });
        if (!staff)
            return res.status(404).json({ error: 'Empleado no encontrado' });
        // All active services in the staff member's unit
        const available = await prisma_1.default.service.findMany({
            where: { unit_id: staff.unit_id, is_active: true },
            select: { id: true, name: true, category: true },
            orderBy: { category: 'asc' },
        });
        const assignedIds = staff.services.map(s => s.service_id);
        return res.json({ available, assigned: assignedIds });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PUT /api/admin/staff/:id/services — replace all service assignments
router.put('/staff/:id/services', async (req, res) => {
    const { service_ids } = req.body;
    if (!Array.isArray(service_ids)) {
        return res.status(400).json({ error: 'service_ids debe ser un array' });
    }
    try {
        const staff = await prisma_1.default.staff.findUnique({ where: { id: req.params.id } });
        if (!staff)
            return res.status(404).json({ error: 'Empleado no encontrado' });
        // Delete all existing assignments, then create new ones
        await prisma_1.default.$transaction([
            prisma_1.default.staffService.deleteMany({ where: { staff_id: req.params.id } }),
            ...service_ids.map((sid) => prisma_1.default.staffService.create({ data: { staff_id: req.params.id, service_id: sid } })),
        ]);
        return res.json({ message: `${service_ids.length} servicios asignados`, service_ids });
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// GET /api/admin/units
router.get('/units', async (_req, res) => {
    try {
        const units = await prisma_1.default.unit.findMany({
            select: { id: true, name: true, short_name: true, code: true, operating_hours: true },
        });
        return res.json(units);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/admin/notifications
router.get('/notifications', async (req, res) => {
    try {
        const notifications = await prisma_1.default.notification.findMany({
            orderBy: { created_at: 'desc' },
            take: 20,
        });
        return res.json(notifications);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/admin/finance/summary — aggregate finance stats
router.get('/finance/summary', async (_req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const [totalRevenue, monthRevenue, pendingPayments, recentPayments, pendingMaintenance, activeLockerRentals,] = await Promise.all([
            // All-time revenue (paid payments)
            prisma_1.default.payment.aggregate({
                where: { status: 'pagado' },
                _sum: { amount: true },
                _count: true,
            }),
            // This month's revenue
            prisma_1.default.payment.aggregate({
                where: { status: 'pagado', created_at: { gte: startOfMonth, lte: endOfMonth } },
                _sum: { amount: true },
                _count: true,
            }),
            // Pending payments
            prisma_1.default.payment.aggregate({
                where: { status: 'pendiente' },
                _sum: { amount: true },
                _count: true,
            }),
            // Last 20 payments
            prisma_1.default.payment.findMany({
                orderBy: { created_at: 'desc' },
                take: 20,
                include: {
                    membership: { select: { member_number: true } },
                    profile: { select: { first_name: true, last_name: true } },
                },
            }),
            // Pending maintenance bills
            prisma_1.default.maintenanceBilling.aggregate({
                where: { status: 'pendiente' },
                _sum: { amount: true },
                _count: true,
            }),
            // Active locker rentals
            prisma_1.default.lockerRental.aggregate({
                where: { status: 'activa' },
                _sum: { price: true },
                _count: true,
            }),
        ]);
        return res.json({
            total_revenue: totalRevenue._sum.amount || 0,
            total_transactions: totalRevenue._count,
            month_revenue: monthRevenue._sum.amount || 0,
            month_transactions: monthRevenue._count,
            pending_amount: pendingPayments._sum.amount || 0,
            pending_count: pendingPayments._count,
            pending_maintenance: pendingMaintenance._sum.amount || 0,
            pending_maintenance_count: pendingMaintenance._count,
            active_locker_revenue: activeLockerRentals._sum.price || 0,
            active_locker_count: activeLockerRentals._count,
            recent_payments: recentPayments,
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/admin/reservations/today — all today's reservations
router.get('/reservations/today', async (_req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const reservations = await prisma_1.default.reservation.findMany({
            where: {
                date: { gte: today, lt: tomorrow },
                status: { not: 'cancelada' },
            },
            include: {
                profile: { select: { first_name: true, last_name: true } },
                service: { select: { name: true } },
                staff: { select: { name: true } },
                unit: { select: { short_name: true } },
            },
            orderBy: { start_time: 'asc' },
        });
        return res.json(reservations);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/admin/lockers/overview — all lockers with rental status
router.get('/lockers/overview', async (_req, res) => {
    try {
        const lockers = await prisma_1.default.locker.findMany({
            include: {
                unit: { select: { short_name: true } },
                rentals: {
                    where: { status: 'activa' },
                    take: 1,
                    include: {
                        profile: { select: { first_name: true, last_name: true } },
                        membership: { select: { member_number: true } },
                    },
                },
            },
            orderBy: [{ unit_id: 'asc' }, { zone: 'asc' }, { number: 'asc' }],
        });
        const total = lockers.length;
        const occupied = lockers.filter(l => l.rentals.length > 0).length;
        return res.json({
            total,
            occupied,
            available: total - occupied,
            occupancy_rate: total > 0 ? Math.round((occupied / total) * 100) : 0,
            lockers,
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/admin/catalog/stats — catalog item counts
router.get('/catalog/stats', async (_req, res) => {
    try {
        const [services, resources, activities, enrollments] = await Promise.all([
            prisma_1.default.service.findMany({ include: { unit: { select: { short_name: true } } } }),
            prisma_1.default.resource.findMany({ include: { unit: { select: { short_name: true } } } }),
            prisma_1.default.activity.findMany({
                include: {
                    unit: { select: { short_name: true } },
                    _count: { select: { enrollments: true } },
                },
            }),
            prisma_1.default.activityEnrollment.count({ where: { status: 'activa' } }),
        ]);
        return res.json({
            services,
            resources,
            activities,
            total_services: services.length,
            total_resources: resources.length,
            total_activities: activities.length,
            total_enrollments: enrollments,
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/admin/commissions — staff commission overview
router.get('/commissions', async (_req, res) => {
    try {
        // Get all independent/commission-based staff
        const staff = await prisma_1.default.staff.findMany({
            where: { is_active: true, employment_type: 'independiente' },
            include: {
                unit: { select: { short_name: true } },
                settlements: { orderBy: { created_at: 'desc' }, take: 3 },
            },
        });
        // Get current month completed reservations per staff
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const reservations = await prisma_1.default.reservation.findMany({
            where: {
                status: 'completada',
                date: { gte: startOfMonth, lte: endOfMonth },
                staff_id: { in: staff.map(s => s.id) },
            },
            include: { service: { select: { name: true, price: true } } },
        });
        // Group by staff
        const resByStaff = {};
        for (const r of reservations) {
            if (!r.staff_id)
                continue;
            if (!resByStaff[r.staff_id])
                resByStaff[r.staff_id] = [];
            resByStaff[r.staff_id].push(r);
        }
        const result = staff.map(s => {
            const staffRes = resByStaff[s.id] || [];
            const grossRevenue = staffRes.reduce((sum, r) => sum + Number(r.service?.price || 0), 0);
            const rate = s.commission_rate ? Number(s.commission_rate) : 0;
            const fixedRent = s.fixed_rent ? Number(s.fixed_rent) : 0;
            let clubCut = 0;
            let staffPayout = 0;
            if (fixedRent > 0) {
                clubCut = fixedRent;
                staffPayout = grossRevenue - fixedRent;
            }
            else if (rate > 0) {
                staffPayout = grossRevenue * rate;
                clubCut = grossRevenue - staffPayout;
            }
            return {
                id: s.id,
                name: s.name,
                role: s.role,
                unit: s.unit?.short_name,
                employment_type: s.employment_type,
                commission_rate: rate,
                fixed_rent: fixedRent,
                month_services: staffRes.length,
                month_gross: grossRevenue,
                month_club_cut: clubCut,
                month_staff_payout: staffPayout,
                settlements: s.settlements.map(st => ({
                    id: st.id,
                    period_start: st.period_start,
                    period_end: st.period_end,
                    total_services: st.total_services,
                    gross_revenue: Number(st.gross_revenue),
                    club_commission: Number(st.club_commission),
                    staff_payout: Number(st.staff_payout),
                    status: st.status,
                })),
            };
        });
        const totalClubCut = result.reduce((sum, s) => sum + s.month_club_cut, 0);
        const totalGross = result.reduce((sum, s) => sum + s.month_gross, 0);
        return res.json({ staff: result, totals: { gross: totalGross, club_cut: totalClubCut }, period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/admin/commissions/generate — generate settlements for a period
router.post('/commissions/generate', async (req, res) => {
    try {
        const { generateStaffSettlements } = await Promise.resolve().then(() => __importStar(require('../services/settlement.service')));
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const results = await generateStaffSettlements(periodStart, periodEnd);
        return res.json({ message: `${results.length} liquidaciones generadas`, settlements: results });
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// GET /api/admin/guests/today — today's expected guest passes for reception
router.get('/guests/today', async (_req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const passes = await prisma_1.default.guestPass.findMany({
            where: {
                visit_date: { gte: today, lt: tomorrow },
                status: { not: 'cancelled' },
            },
            include: {
                invited_by: {
                    select: {
                        first_name: true, last_name: true,
                        membership: { select: { member_number: true } },
                    },
                },
            },
            orderBy: { created_at: 'asc' },
        });
        const pending = passes.filter(p => p.status === 'active').length;
        const checkedIn = passes.filter(p => p.status === 'used').length;
        return res.json({
            passes,
            stats: { total: passes.length, pending, checked_in: checkedIn },
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/admin/qr/validate — validate a member QR code at reception
router.post('/qr/validate', async (req, res) => {
    const { code } = req.body;
    if (!code)
        return res.status(400).json({ error: 'Código requerido' });
    try {
        // Code format: "CL-{member_number}" e.g. "CL-0001"
        const memberNumber = parseInt(code.replace('CL-', ''), 10);
        if (isNaN(memberNumber))
            return res.status(400).json({ error: 'Código inválido' });
        const membership = await prisma_1.default.membership.findUnique({
            where: { member_number: memberNumber },
            include: {
                profiles: {
                    where: { role: 'titular', is_active: true },
                    select: { first_name: true, last_name: true, photo_url: true },
                    take: 1,
                },
            },
        });
        if (!membership)
            return res.status(404).json({ error: 'Membresía no encontrada', valid: false });
        const isActive = membership.status === 'activa';
        const titular = membership.profiles[0];
        return res.json({
            valid: isActive,
            member_number: membership.member_number,
            tier: membership.tier,
            status: membership.status,
            titular: titular ? `${titular.first_name} ${titular.last_name}` : 'N/A',
            message: isActive ? 'Acceso permitido' : 'Membresía suspendida — verificar en caja',
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
