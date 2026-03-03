import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireStaffAuth } from '../middleware/auth';

const router = Router();

// ── GET /api/events ── Public: list published upcoming events
router.get('/', async (req, res) => {
    try {
        const events = await prisma.clubEvent.findMany({
            where: {
                is_published: true,
                event_date: { gte: new Date(Date.now() - 86400000) }, // include today
            },
            orderBy: { event_date: 'asc' },
            take: 20,
        });
        res.json(events);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/events/all ── Staff: list all events (including unpublished)
router.get('/all', requireStaffAuth, async (req, res) => {
    try {
        const events = await prisma.clubEvent.findMany({
            orderBy: { event_date: 'desc' },
        });
        res.json(events);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/events ── Staff: create event
router.post('/', requireStaffAuth, async (req: any, res) => {
    const { title, description, category, event_date, end_date, location, image_color, is_published, is_featured } = req.body;
    if (!title || !event_date) return res.status(400).json({ error: 'title y event_date son requeridos' });
    try {
        const event = await prisma.clubEvent.create({
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
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ── PUT /api/events/:id ── Staff: update event
router.put('/:id', requireStaffAuth, async (req, res) => {
    const { id } = req.params;
    const { title, description, category, event_date, end_date, location, image_color, is_published, is_featured } = req.body;
    try {
        const event = await prisma.clubEvent.update({
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
    } catch (err: any) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Evento no encontrado' });
        res.status(500).json({ error: err.message });
    }
});

// ── DELETE /api/events/:id ── Staff: delete event
router.delete('/:id', requireStaffAuth, async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.clubEvent.delete({ where: { id } });
        res.json({ success: true });
    } catch (err: any) {
        if (err.code === 'P2025') return res.status(404).json({ error: 'Evento no encontrado' });
        res.status(500).json({ error: err.message });
    }
});

export default router;
