"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../lib/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/notifications/my - user's notifications (newest first, max 50)
router.get('/my', auth_1.requireAuth, async (req, res) => {
    const user = req.user;
    try {
        const notifications = await prisma_1.default.notification.findMany({
            where: {
                recipient_id: user.id,
                recipient_type: 'member',
            },
            orderBy: { created_at: 'desc' },
            take: 50,
        });
        const unread_count = notifications.filter(n => !n.is_read).length;
        return res.json({ notifications, unread_count });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PATCH /api/notifications/:id/read - mark single notification as read
router.patch('/:id/read', auth_1.requireAuth, async (req, res) => {
    const user = req.user;
    const { id } = req.params;
    try {
        const notification = await prisma_1.default.notification.findUnique({ where: { id } });
        if (!notification)
            return res.status(404).json({ error: 'Notificación no encontrada' });
        if (notification.recipient_id !== user.id)
            return res.status(403).json({ error: 'No autorizado' });
        const updated = await prisma_1.default.notification.update({
            where: { id },
            data: { is_read: true, read_at: new Date() },
        });
        return res.json(updated);
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// POST /api/notifications/read-all - mark all as read
router.post('/read-all', auth_1.requireAuth, async (req, res) => {
    const user = req.user;
    try {
        const { count } = await prisma_1.default.notification.updateMany({
            where: {
                recipient_id: user.id,
                recipient_type: 'member',
                is_read: false,
            },
            data: { is_read: true, read_at: new Date() },
        });
        return res.json({ message: `${count} notificaciones marcadas como leídas` });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
