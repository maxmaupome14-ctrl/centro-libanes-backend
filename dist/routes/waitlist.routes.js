"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../lib/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// POST /api/waitlist — join a waitlist
router.post('/', auth_1.requireAuth, async (req, res) => {
    try {
        const { resource_type, service_id, activity_id, date, time_slot } = req.body;
        if (!date || !time_slot) {
            return res.status(400).json({ error: 'Fecha y horario requeridos' });
        }
        if (!resource_type && !service_id && !activity_id) {
            return res.status(400).json({ error: 'Debes especificar recurso, servicio o actividad' });
        }
        const profileId = req.user.id;
        const membershipId = req.user.membership_id;
        // Check if already on this waitlist
        const existing = await prisma_1.default.waitlist.findFirst({
            where: {
                profile_id: profileId,
                resource_type: resource_type || null,
                service_id: service_id || null,
                activity_id: activity_id || null,
                date: new Date(date),
                time_slot,
                status: { in: ['waiting', 'notified'] },
            },
        });
        if (existing) {
            return res.status(400).json({ error: 'Ya estás en la lista de espera para este horario' });
        }
        // Get next position
        const lastInQueue = await prisma_1.default.waitlist.findFirst({
            where: {
                resource_type: resource_type || null,
                service_id: service_id || null,
                activity_id: activity_id || null,
                date: new Date(date),
                time_slot,
                status: { in: ['waiting', 'notified'] },
            },
            orderBy: { position: 'desc' },
        });
        const position = (lastInQueue?.position || 0) + 1;
        const entry = await prisma_1.default.waitlist.create({
            data: {
                profile_id: profileId,
                membership_id: membershipId,
                resource_type: resource_type || null,
                service_id: service_id || null,
                activity_id: activity_id || null,
                date: new Date(date),
                time_slot,
                position,
            },
        });
        return res.status(201).json({ ...entry, position });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/waitlist/my — my active waitlist entries
router.get('/my', auth_1.requireAuth, async (req, res) => {
    try {
        const entries = await prisma_1.default.waitlist.findMany({
            where: {
                profile_id: req.user.id,
                status: { in: ['waiting', 'notified'] },
                date: { gte: new Date() },
            },
            orderBy: { date: 'asc' },
        });
        return res.json(entries);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// DELETE /api/waitlist/:id — leave the waitlist
router.delete('/:id', auth_1.requireAuth, async (req, res) => {
    try {
        const entry = await prisma_1.default.waitlist.findUnique({ where: { id: req.params.id } });
        if (!entry)
            return res.status(404).json({ error: 'Entrada no encontrada' });
        if (entry.profile_id !== req.user.id) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        await prisma_1.default.waitlist.update({
            where: { id: req.params.id },
            data: { status: 'cancelled' },
        });
        // Reorder positions for remaining entries
        const remaining = await prisma_1.default.waitlist.findMany({
            where: {
                resource_type: entry.resource_type,
                service_id: entry.service_id,
                activity_id: entry.activity_id,
                date: entry.date,
                time_slot: entry.time_slot,
                status: 'waiting',
            },
            orderBy: { position: 'asc' },
        });
        for (let i = 0; i < remaining.length; i++) {
            if (remaining[i].position !== i + 1) {
                await prisma_1.default.waitlist.update({
                    where: { id: remaining[i].id },
                    data: { position: i + 1 },
                });
            }
        }
        return res.json({ message: 'Has salido de la lista de espera' });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/waitlist/status — check waitlist status for a specific slot
router.get('/status', async (req, res) => {
    try {
        const { resource_type, service_id, activity_id, date, time_slot } = req.query;
        if (!date || !time_slot) {
            return res.status(400).json({ error: 'Fecha y horario requeridos' });
        }
        const count = await prisma_1.default.waitlist.count({
            where: {
                resource_type: resource_type || null,
                service_id: service_id || null,
                activity_id: activity_id || null,
                date: new Date(date),
                time_slot: time_slot,
                status: { in: ['waiting', 'notified'] },
            },
        });
        return res.json({ waitlist_count: count });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/waitlist/promote — called when a reservation is cancelled (internal use)
// Promotes the first person in queue and creates a notification
router.post('/promote', async (req, res) => {
    try {
        const { resource_type, service_id, activity_id, date, time_slot } = req.body;
        const next = await prisma_1.default.waitlist.findFirst({
            where: {
                resource_type: resource_type || null,
                service_id: service_id || null,
                activity_id: activity_id || null,
                date: new Date(date),
                time_slot,
                status: 'waiting',
            },
            orderBy: { position: 'asc' },
            include: {
                profile: { select: { first_name: true, last_name: true } },
            },
        });
        if (!next) {
            return res.json({ promoted: false, message: 'Nadie en lista de espera' });
        }
        // Give them a 2-hour window to claim
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 2);
        await prisma_1.default.waitlist.update({
            where: { id: next.id },
            data: { status: 'notified', notified_at: new Date(), expires_at: expiresAt },
        });
        // Create in-app notification
        await prisma_1.default.notification.create({
            data: {
                recipient_id: next.profile_id,
                recipient_type: 'member',
                channel: 'in_app',
                type: 'waitlist_available',
                title: '¡Lugar disponible!',
                body: `Se abrió un lugar para ${time_slot} el ${new Date(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}. Tienes 2 horas para reservar.`,
                data: JSON.stringify({ resource_type, service_id, activity_id, date, time_slot }),
            },
        });
        return res.json({
            promoted: true,
            profile: `${next.profile.first_name} ${next.profile.last_name}`,
            expires_at: expiresAt,
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
