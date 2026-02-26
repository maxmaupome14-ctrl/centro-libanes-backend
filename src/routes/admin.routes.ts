import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireStaffAuth } from '../middleware/auth';

const router = Router();

// GET /api/admin/staff
router.get('/staff', async (req: any, res: any) => {
    try {
        const { unit_id } = req.query;
        let where: any = {};
        if (unit_id) where.unit_id = unit_id;

        const staff = await prisma.staff.findMany({
            where,
            include: { unit: { select: { short_name: true, name: true } } },
            orderBy: { name: 'asc' },
        });
        return res.json(staff);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/staff
router.post('/staff', async (req: any, res: any) => {
    const { name, role, employment_type, unit_id, phone, commission_rate, fixed_rent } = req.body;

    if (!name || !role || !employment_type || !unit_id) {
        return res.status(400).json({ error: 'name, role, employment_type y unit_id son requeridos' });
    }

    try {
        const unit = await prisma.unit.findUnique({ where: { id: unit_id } });
        if (!unit) return res.status(404).json({ error: 'Unidad no encontrada' });

        const staff = await prisma.staff.create({
            data: {
                name,
                role,
                employment_type,
                unit_id,
                phone: phone || null,
                commission_rate: commission_rate || null,
                fixed_rent: fixed_rent || null,
                is_active: true,
            } as any,
            include: { unit: { select: { short_name: true } } },
        });

        return res.status(201).json({ ...staff, message: `Empleado ${name} registrado` });
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// PATCH /api/admin/staff/:id
router.patch('/staff/:id', async (req: any, res: any) => {
    const { id } = req.params;
    const { name, role, employment_type, phone, is_active, commission_rate, fixed_rent } = req.body;

    try {
        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (role !== undefined) updateData.role = role;
        if (employment_type !== undefined) updateData.employment_type = employment_type;
        if (phone !== undefined) updateData.phone = phone;
        if (is_active !== undefined) updateData.is_active = is_active;
        if (commission_rate !== undefined) updateData.commission_rate = commission_rate;
        if (fixed_rent !== undefined) updateData.fixed_rent = fixed_rent;

        const staff = await prisma.staff.update({
            where: { id },
            data: updateData,
            include: { unit: { select: { short_name: true } } },
        });

        return res.json(staff);
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// DELETE /api/admin/staff/:id
router.delete('/staff/:id', async (req: any, res: any) => {
    try {
        await prisma.staff.update({
            where: { id: req.params.id },
            data: { is_active: false },
        });
        return res.json({ message: 'Empleado desactivado' });
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// GET /api/admin/units
router.get('/units', async (_req: any, res: any) => {
    try {
        const units = await prisma.unit.findMany({
            select: { id: true, name: true, short_name: true, code: true, operating_hours: true },
        });
        return res.json(units);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/notifications
router.get('/notifications', async (req: any, res: any) => {
    try {
        const notifications = await prisma.notification.findMany({
            orderBy: { created_at: 'desc' },
            take: 20,
        });
        return res.json(notifications);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

export default router;
