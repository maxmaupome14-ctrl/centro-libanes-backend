"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../lib/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/lockers - list lockers for a unit
router.get('/', async (req, res) => {
    const { unit_name } = req.query;
    try {
        let where = {};
        if (unit_name) {
            const unit = await prisma_1.default.unit.findFirst({ where: { short_name: { contains: unit_name } } });
            if (unit)
                where.unit_id = unit.id;
        }
        const lockers = await prisma_1.default.locker.findMany({
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
            is_available: l.rentals.length === 0 && l.condition === 'operativo',
            current_rental: l.rentals[0] || null,
        }));
        return res.json(result);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/lockers/my - MUST be before /:id routes
router.get('/my', auth_1.requireAuth, async (req, res) => {
    const user = req.user;
    try {
        const rentals = await prisma_1.default.lockerRental.findMany({
            where: { profile_id: user.id, status: 'activa' },
            include: {
                locker: { include: { unit: { select: { short_name: true } } } },
            },
        });
        return res.json(rentals);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/lockers/:id/rent
router.post('/:id/rent', auth_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    const permissions = user.parsedPermissions;
    if (permissions.can_rent_locker === false) {
        return res.status(403).json({ error: 'No tienes permiso para rentar lockers' });
    }
    try {
        const locker = await prisma_1.default.locker.findUnique({ where: { id } });
        if (!locker)
            return res.status(404).json({ error: 'Locker no encontrado' });
        if (locker.condition !== 'operativo')
            return res.status(400).json({ error: 'Locker no disponible' });
        // Check if already rented
        const existing = await prisma_1.default.lockerRental.findFirst({
            where: { locker_id: id, status: 'activa' },
        });
        if (existing)
            return res.status(400).json({ error: 'Este locker ya está rentado' });
        // Price based on size
        const prices = { chico: 400, mediano: 600, grande: 800 };
        const price = prices[locker.size] || 500;
        // Calculate current quarter and end date
        const now = new Date();
        const currentQ = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
        // Last day of current quarter: month 3,6,9,12 → day 0 of next month
        const qEnd = new Date(now.getFullYear(), Math.ceil((now.getMonth() + 1) / 3) * 3, 0);
        qEnd.setHours(23, 59, 59, 999);
        const rental = await prisma_1.default.lockerRental.create({
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
            message: `Locker ${locker.number} rentado hasta ${qEnd.toISOString().split('T')[0]}`,
        });
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// POST /api/lockers/:id/release
router.post('/:id/release', auth_1.requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    try {
        const rental = await prisma_1.default.lockerRental.findFirst({
            where: { locker_id: id, profile_id: user.id, status: 'activa' },
        });
        if (!rental)
            return res.status(404).json({ error: 'No tienes este locker rentado' });
        await prisma_1.default.lockerRental.update({
            where: { id: rental.id },
            data: { status: 'cancelada', auto_renew: false },
        });
        return res.json({ message: 'Locker liberado exitosamente' });
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
exports.default = router;
