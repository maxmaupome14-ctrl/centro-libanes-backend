import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /api/notifications/my - user's notifications (newest first, max 50)
router.get('/my', requireAuth, async (req: any, res: any) => {
    const user = req.user;
    try {
        const notifications = await prisma.notification.findMany({
            where: {
                recipient_id: user.id,
                recipient_type: 'member',
            },
            orderBy: { created_at: 'desc' },
            take: 50,
        });

        const unread_count = notifications.filter(n => !n.is_read).length;

        return res.json({ notifications, unread_count });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// PATCH /api/notifications/:id/read - mark single notification as read
router.patch('/:id/read', requireAuth, async (req: any, res: any) => {
    const user = req.user;
    const { id } = req.params;

    try {
        const notification = await prisma.notification.findUnique({ where: { id } });

        if (!notification) return res.status(404).json({ error: 'Notificación no encontrada' });
        if (notification.recipient_id !== user.id) return res.status(403).json({ error: 'No autorizado' });

        const updated = await prisma.notification.update({
            where: { id },
            data: { is_read: true, read_at: new Date() },
        });

        return res.json(updated);
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/notifications/read-all - mark all as read
router.post('/read-all', requireAuth, async (req: any, res: any) => {
    const user = req.user;
    try {
        const { count } = await prisma.notification.updateMany({
            where: {
                recipient_id: user.id,
                recipient_type: 'member',
                is_read: false,
            },
            data: { is_read: true, read_at: new Date() },
        });

        return res.json({ message: `${count} notificaciones marcadas como leídas` });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

export default router;
