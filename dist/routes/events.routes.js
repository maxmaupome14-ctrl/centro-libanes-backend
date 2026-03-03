"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../lib/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// ── GET /api/events ── Public: list published upcoming events
router.get('/', async (req, res) => {
    try {
        const events = await prisma_1.default.clubEvent.findMany({
            where: {
                is_published: true,
                event_date: { gte: new Date(Date.now() - 86400000) }, // include today
            },
            orderBy: { event_date: 'asc' },
            take: 20,
        });
        res.json(events);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/events/all ── Staff: list all events (including unpublished)
router.get('/all', auth_1.requireStaffAuth, async (req, res) => {
    try {
        const events = await prisma_1.default.clubEvent.findMany({
            orderBy: { event_date: 'desc' },
        });
        res.json(events);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/events ── Staff: create event
router.post('/', auth_1.requireStaffAuth, async (req, res) => {
    const { title, description, category, event_date, end_date, location, image_color, is_published, is_featured } = req.body;
    if (!title || !event_date)
        return res.status(400).json({ error: 'title y event_date son requeridos' });
    try {
        const event = await prisma_1.default.clubEvent.create({
            data: {
                title,
                description: description || null,
                category: category || 'general',
                event_date: new Date(event_date),
                end_date: end_date ? new Date(end_date) : null,
                location: location || null,
                image_color: image_color || null,
                is_published: is_published ?? true,
                is_featured: is_featured ?? false,
                created_by: req.staff?.id || null,
            },
        });
        res.status(201).json(event);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── PUT /api/events/:id ── Staff: update event
router.put('/:id', auth_1.requireStaffAuth, async (req, res) => {
    const { id } = req.params;
    const { title, description, category, event_date, end_date, location, image_color, is_published, is_featured } = req.body;
    try {
        const event = await prisma_1.default.clubEvent.update({
            where: { id },
            data: {
                ...(title && { title }),
                ...(description !== undefined && { description }),
                ...(category && { category }),
                ...(event_date && { event_date: new Date(event_date) }),
                ...(end_date !== undefined && { end_date: end_date ? new Date(end_date) : null }),
                ...(location !== undefined && { location }),
                ...(image_color !== undefined && { image_color }),
                ...(is_published !== undefined && { is_published }),
                ...(is_featured !== undefined && { is_featured }),
            },
        });
        res.json(event);
    }
    catch (err) {
        if (err.code === 'P2025')
            return res.status(404).json({ error: 'Evento no encontrado' });
        res.status(500).json({ error: err.message });
    }
});
// ── DELETE /api/events/:id ── Staff: delete event
router.delete('/:id', auth_1.requireStaffAuth, async (req, res) => {
    const { id } = req.params;
    try {
        await prisma_1.default.clubEvent.delete({ where: { id } });
        res.json({ success: true });
    }
    catch (err) {
        if (err.code === 'P2025')
            return res.status(404).json({ error: 'Evento no encontrado' });
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
