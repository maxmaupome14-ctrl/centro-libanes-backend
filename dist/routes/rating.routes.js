"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../lib/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// POST /api/ratings — submit a rating
router.post('/', auth_1.requireAuth, async (req, res) => {
    try {
        const { reservation_id, staff_id, service_id, resource_type, activity_id, score, comment, is_anonymous } = req.body;
        if (!score || score < 1 || score > 5) {
            return res.status(400).json({ error: 'La calificación debe ser entre 1 y 5' });
        }
        if (!staff_id && !service_id && !resource_type && !activity_id) {
            return res.status(400).json({ error: 'Debes calificar algo: staff, servicio, cancha o actividad' });
        }
        // If linked to a reservation, check it exists and belongs to user
        if (reservation_id) {
            const reservation = await prisma_1.default.reservation.findUnique({ where: { id: reservation_id } });
            if (!reservation || reservation.profile_id !== req.user.id) {
                return res.status(403).json({ error: 'Reservación no válida' });
            }
            // Check no duplicate
            const existing = await prisma_1.default.rating.findUnique({
                where: { profile_id_reservation_id: { profile_id: req.user.id, reservation_id } },
            });
            if (existing) {
                return res.status(400).json({ error: 'Ya calificaste esta reservación' });
            }
        }
        const rating = await prisma_1.default.rating.create({
            data: {
                profile_id: req.user.id,
                reservation_id: reservation_id || null,
                staff_id: staff_id || null,
                service_id: service_id || null,
                resource_type: resource_type || null,
                activity_id: activity_id || null,
                score,
                comment: comment || null,
                is_anonymous: is_anonymous || false,
            },
        });
        return res.status(201).json(rating);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/ratings/staff/:staffId — get average rating for a staff member
router.get('/staff/:staffId', async (req, res) => {
    try {
        const ratings = await prisma_1.default.rating.findMany({
            where: { staff_id: req.params.staffId },
            include: {
                profile: { select: { first_name: true, last_name: true } },
            },
            orderBy: { created_at: 'desc' },
        });
        const count = ratings.length;
        const average = count > 0 ? ratings.reduce((sum, r) => sum + r.score, 0) / count : 0;
        return res.json({
            staff_id: req.params.staffId,
            average: Math.round(average * 10) / 10,
            count,
            ratings: ratings.map(r => ({
                score: r.score,
                comment: r.comment,
                anonymous: r.is_anonymous,
                author: r.is_anonymous ? null : `${r.profile.first_name} ${r.profile.last_name?.[0] || ''}.`,
                date: r.created_at,
            })),
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/ratings/service/:serviceId — get average rating for a service
router.get('/service/:serviceId', async (req, res) => {
    try {
        const ratings = await prisma_1.default.rating.findMany({
            where: { service_id: req.params.serviceId },
            include: {
                profile: { select: { first_name: true, last_name: true } },
            },
            orderBy: { created_at: 'desc' },
        });
        const count = ratings.length;
        const average = count > 0 ? ratings.reduce((sum, r) => sum + r.score, 0) / count : 0;
        return res.json({
            service_id: req.params.serviceId,
            average: Math.round(average * 10) / 10,
            count,
            ratings: ratings.map(r => ({
                score: r.score,
                comment: r.comment,
                anonymous: r.is_anonymous,
                author: r.is_anonymous ? null : `${r.profile.first_name} ${r.profile.last_name?.[0] || ''}.`,
                date: r.created_at,
            })),
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/ratings/resource/:type — get average rating for a resource type
router.get('/resource/:type', async (req, res) => {
    try {
        const ratings = await prisma_1.default.rating.findMany({
            where: { resource_type: req.params.type },
            include: {
                profile: { select: { first_name: true, last_name: true } },
            },
            orderBy: { created_at: 'desc' },
        });
        const count = ratings.length;
        const average = count > 0 ? ratings.reduce((sum, r) => sum + r.score, 0) / count : 0;
        return res.json({
            resource_type: req.params.type,
            average: Math.round(average * 10) / 10,
            count,
            ratings: ratings.map(r => ({
                score: r.score,
                comment: r.comment,
                anonymous: r.is_anonymous,
                author: r.is_anonymous ? null : `${r.profile.first_name} ${r.profile.last_name?.[0] || ''}.`,
                date: r.created_at,
            })),
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/ratings/pending — reservations that need rating (completed, not yet rated)
router.get('/pending', auth_1.requireAuth, async (req, res) => {
    try {
        // Find completed reservations from the last 7 days not yet rated
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const completedReservations = await prisma_1.default.reservation.findMany({
            where: {
                profile_id: req.user.id,
                status: 'completada',
                date: { gte: sevenDaysAgo },
            },
            include: {
                service: { select: { name: true, category: true } },
                staff: { select: { name: true } },
            },
            orderBy: { date: 'desc' },
        });
        // Filter out already rated
        const myRatings = await prisma_1.default.rating.findMany({
            where: {
                profile_id: req.user.id,
                reservation_id: { in: completedReservations.map(r => r.id) },
            },
            select: { reservation_id: true },
        });
        const ratedIds = new Set(myRatings.map(r => r.reservation_id));
        const pending = completedReservations.filter(r => !ratedIds.has(r.id));
        return res.json(pending);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
