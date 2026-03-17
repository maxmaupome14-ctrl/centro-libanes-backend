import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { pushNotification } from '../services/notification.service';
import crypto from 'crypto';

const router = Router();

/** Generate a 6-char uppercase alphanumeric pass code */
function generatePassCode(): string {
    return crypto.randomBytes(4).toString('hex').substring(0, 6).toUpperCase();
}

// GET /api/guests — list my guest passes
router.get('/', requireAuth, async (req: any, res) => {
    try {
        const passes = await prisma.guestPass.findMany({
            where: { invited_by_id: req.user.id },
            orderBy: { visit_date: 'desc' },
        });
        return res.json(passes);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/guests — create a guest pass (invite someone)
router.post('/', requireAuth, async (req: any, res) => {
    try {
        const { guest_name, guest_phone, guest_email, visit_date, max_guests, notes } = req.body;

        if (!guest_name || !visit_date) {
            return res.status(400).json({ error: 'Nombre del invitado y fecha son obligatorios' });
        }

        const visitDateObj = new Date(visit_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (visitDateObj < today) {
            return res.status(400).json({ error: 'La fecha de visita no puede ser en el pasado' });
        }

        // Limit: max 3 guest passes per member per month (included with membership)
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
        const monthCount = await prisma.guestPass.count({
            where: {
                invited_by_id: req.user.id,
                status: { not: 'cancelled' },
                visit_date: { gte: startOfMonth, lte: endOfMonth },
            },
        });
        if (monthCount >= 3) {
            return res.status(400).json({ error: 'Has alcanzado el límite de 3 pases de invitado este mes. Contacta administración para solicitar pases adicionales.' });
        }

        // Generate unique code (retry if collision)
        let passCode = generatePassCode();
        let attempts = 0;
        while (attempts < 5) {
            const existing = await prisma.guestPass.findUnique({ where: { pass_code: passCode } });
            if (!existing) break;
            passCode = generatePassCode();
            attempts++;
        }

        // Guest pass fee — could be configurable, using 0 for now (club decides)
        const pass = await prisma.guestPass.create({
            data: {
                invited_by_id: req.user.id,
                guest_name,
                guest_phone: guest_phone || null,
                guest_email: guest_email || null,
                visit_date: visitDateObj,
                pass_code: passCode,
                max_guests: max_guests || 1,
                fee: 0,
                notes: notes || null,
            },
        });

        return res.status(201).json(pass);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/guests/:id — get single pass detail
router.get('/:id', requireAuth, async (req: any, res) => {
    try {
        const pass = await prisma.guestPass.findUnique({
            where: { id: req.params.id },
            include: {
                invited_by: {
                    select: { first_name: true, last_name: true, membership: { select: { member_number: true } } },
                },
            },
        });
        if (!pass) return res.status(404).json({ error: 'Pase no encontrado' });
        if (pass.invited_by_id !== req.user.id) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        return res.json(pass);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// DELETE /api/guests/:id — cancel a guest pass
router.delete('/:id', requireAuth, async (req: any, res) => {
    try {
        const pass = await prisma.guestPass.findUnique({ where: { id: req.params.id } });
        if (!pass) return res.status(404).json({ error: 'Pase no encontrado' });
        if (pass.invited_by_id !== req.user.id) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        if (pass.status === 'used') {
            return res.status(400).json({ error: 'No puedes cancelar un pase ya utilizado' });
        }

        await prisma.guestPass.update({
            where: { id: req.params.id },
            data: { status: 'cancelled' },
        });

        return res.json({ message: 'Pase cancelado' });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/guests/validate — validate a guest pass code (for reception/staff)
router.post('/validate', async (req, res) => {
    try {
        const { pass_code } = req.body;
        if (!pass_code) return res.status(400).json({ error: 'Código requerido' });

        const pass = await prisma.guestPass.findUnique({
            where: { pass_code: pass_code.toUpperCase() },
            include: {
                invited_by: {
                    select: { first_name: true, last_name: true, membership: { select: { member_number: true } } },
                },
            },
        });

        if (!pass) return res.status(404).json({ error: 'Código inválido', valid: false });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const visitDay = new Date(pass.visit_date);
        visitDay.setHours(0, 0, 0, 0);

        if (pass.status === 'cancelled') {
            return res.json({ valid: false, reason: 'Pase cancelado', pass });
        }
        if (pass.status === 'used') {
            return res.json({ valid: false, reason: 'Pase ya utilizado', pass });
        }
        if (visitDay.getTime() !== today.getTime()) {
            return res.json({ valid: false, reason: `Pase válido para ${visitDay.toLocaleDateString('es-MX')}`, pass });
        }

        return res.json({ valid: true, pass });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/guests/:id/checkin — mark guest as checked in (for reception/staff)
router.post('/:id/checkin', async (req, res) => {
    try {
        const pass = await prisma.guestPass.findUnique({ where: { id: req.params.id } });
        if (!pass) return res.status(404).json({ error: 'Pase no encontrado' });
        if (pass.status !== 'active') {
            return res.status(400).json({ error: 'Pase no está activo' });
        }

        await prisma.guestPass.update({
            where: { id: req.params.id },
            data: { status: 'used', checked_in_at: new Date() },
        });

        // Notify the member who invited this guest
        pushNotification(
            pass.invited_by_id,
            'member',
            'Tu invitado llegó',
            `${pass.guest_name} acaba de registrar su entrada al club.`,
            JSON.stringify({ guest_pass_id: pass.id }),
            'guest_checkin'
        ).catch(err => console.error('[GuestCheckin] Failed to send notification:', err));

        return res.json({ message: 'Invitado registrado exitosamente' });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

export default router;
