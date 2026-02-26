import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

const getDefaultPermissions = (role: string, is_minor: boolean) => {
    if (role === 'titular') {
        return {
            can_book_spa: true, can_book_barberia: true, can_book_deportes: true,
            can_book_alberca: true, can_rent_locker: true, can_make_payments: true,
            can_manage_beneficiaries: true, can_approve_reservations: true,
            can_view_account_statement: true, requires_approval: false,
            max_active_reservations: null, spending_limit_monthly: null,
            allowed_hours_start: null, allowed_hours_end: null
        };
    }

    if (role === 'hijo' && is_minor) {
        return {
            can_book_spa: false, can_book_barberia: false, can_book_deportes: true,
            can_book_alberca: true, can_rent_locker: false, can_make_payments: false,
            can_manage_beneficiaries: false, can_approve_reservations: false,
            can_view_account_statement: false, requires_approval: true,
            max_active_reservations: 2, spending_limit_monthly: 2000,
            allowed_hours_start: "07:00", allowed_hours_end: "20:00"
        };
    }

    // conyugue / adult hijo
    return {
        can_book_spa: true, can_book_barberia: true, can_book_deportes: true,
        can_book_alberca: true, can_rent_locker: true, can_make_payments: false,
        can_manage_beneficiaries: false, can_approve_reservations: true,
        can_view_account_statement: true, requires_approval: false,
        max_active_reservations: null, spending_limit_monthly: null,
        allowed_hours_start: null, allowed_hours_end: null
    };
};

// GET /api/membership/:id/beneficiaries
router.get('/:id/beneficiaries', requireAuth, async (req, res) => {
    const { id } = req.params;

    try {
        const profiles = await prisma.memberProfile.findMany({
            where: { membership_id: id, is_active: true },
            select: {
                id: true, first_name: true, last_name: true, role: true,
                email: true, phone: true, date_of_birth: true, is_minor: true,
                photo_url: true, permissions: true, profile_status: true,
            }
        });

        const parsed = profiles.map(p => ({
            ...p,
            permissions: (() => {
                try {
                    return typeof p.permissions === 'string' ? JSON.parse(p.permissions) : p.permissions;
                } catch { return {}; }
            })()
        }));

        return res.json(parsed);
    } catch (error) {
        return res.status(500).json({ error: 'Server Error' });
    }
});

// POST /api/membership/:id/beneficiaries
router.post('/:id/beneficiaries', requireAuth, async (req: any, res) => {
    const { id } = req.params;
    const { first_name, last_name, role, date_of_birth, email, phone, gender } = req.body;
    const userPerms = req.user.parsedPermissions;

    if (!userPerms.can_manage_beneficiaries) {
        return res.status(403).json({ error: 'No tienes permiso para gestionar beneficiarios' });
    }

    if (!first_name || !last_name || !role || !date_of_birth) {
        return res.status(400).json({ error: 'first_name, last_name, role y date_of_birth son requeridos' });
    }

    try {
        const dob = new Date(date_of_birth);
        const ageDiffMs = Date.now() - dob.getTime();
        const ageDate = new Date(ageDiffMs);
        const is_minor = Math.abs(ageDate.getUTCFullYear() - 1970) < 18;

        const permissions = getDefaultPermissions(role, is_minor);

        const newProfile = await prisma.memberProfile.create({
            data: {
                membership_id: id,
                role,
                first_name,
                last_name,
                date_of_birth: dob,
                is_minor,
                email: email || null,
                phone: phone || null,
                gender: gender || null,
                permissions: JSON.stringify(permissions),
            }
        });

        return res.status(201).json({ ...newProfile, permissions });
    } catch (error: any) {
        console.error(error);
        return res.status(500).json({ error: 'Error al crear beneficiario: ' + error.message });
    }
});

// PATCH /api/membership/:id/beneficiaries/:pid
router.patch('/:id/beneficiaries/:pid', requireAuth, async (req: any, res) => {
    const { pid } = req.params;
    const { permissions, spending_limit_monthly } = req.body;
    const userPerms = req.user.parsedPermissions;

    if (!userPerms.can_manage_beneficiaries) {
        return res.status(403).json({ error: 'No tienes permiso para editar beneficiarios' });
    }

    try {
        const updateData: any = {};

        if (permissions) {
            let permsObj = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;
            if (spending_limit_monthly !== undefined) {
                permsObj.spending_limit_monthly = spending_limit_monthly;
            }
            updateData.permissions = JSON.stringify(permsObj);
        }

        const updatedProfile = await prisma.memberProfile.update({
            where: { id: pid },
            data: updateData
        });

        return res.json({
            ...updatedProfile,
            permissions: JSON.parse(updatedProfile.permissions),
        });
    } catch (error) {
        return res.status(500).json({ error: 'Error actualizando perfil' });
    }
});

// DELETE /api/membership/:id/beneficiaries/:pid
router.delete('/:id/beneficiaries/:pid', requireAuth, async (req: any, res) => {
    const { pid } = req.params;
    const userPerms = req.user.parsedPermissions;

    if (!userPerms.can_manage_beneficiaries) {
        return res.status(403).json({ error: 'No tienes permiso para desactivar beneficiarios' });
    }

    try {
        await prisma.memberProfile.update({
            where: { id: pid },
            data: { is_active: false, profile_status: 'inactivo' }
        });

        await prisma.reservation.updateMany({
            where: {
                profile_id: pid,
                status: { in: ['confirmada', 'pendiente', 'pendiente_aprobacion'] },
                date: { gte: new Date() }
            },
            data: {
                status: 'cancelada',
                cancellation_reason: 'Perfil desactivado por el titular.'
            }
        });

        return res.json({ success: true, message: 'Beneficiario desactivado y reservas futuras canceladas.' });
    } catch (error) {
        return res.status(500).json({ error: 'Error desactivando perfil' });
    }
});

export default router;
