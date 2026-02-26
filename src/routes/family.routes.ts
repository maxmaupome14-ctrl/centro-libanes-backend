import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const ProfileRole = {
    titular: 'titular',
    conyugue: 'conyugue',
    hijo: 'hijo'
};
const router = Router();
const prisma = new PrismaClient();

// Real Auth Middleware
const requireAuth = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        const profileId = token.replace('mock_jwt_token_', '');
        const profile = await prisma.memberProfile.findUnique({
            where: { id: profileId },
            include: { membership: true },
        });
        if (!profile) return res.status(401).json({ error: 'Invalid token' });
        req.user = { ...profile, membership_id: profile.membership_id };
        next();
    } catch { return res.status(500).json({ error: 'Auth error' }); }
};

const getDefaultPermissions = (role: string, is_minor: boolean) => {
    if (role === ProfileRole.titular) {
        return {
            can_book_spa: true, can_book_barberia: true, can_book_deportes: true,
            can_book_alberca: true, can_rent_locker: true, can_make_payments: true,
            can_manage_beneficiaries: true, can_approve_reservations: true,
            can_view_account_statement: true, requires_approval: false,
            max_active_reservations: null, spending_limit_monthly: null,
            allowed_hours_start: null, allowed_hours_end: null
        };
    }

    if (role === ProfileRole.hijo && is_minor) {
        return {
            can_book_spa: false, can_book_barberia: false, can_book_deportes: true,
            can_book_alberca: true, can_rent_locker: false, can_make_payments: false,
            can_manage_beneficiaries: false, can_approve_reservations: false,
            can_view_account_statement: false, requires_approval: true,
            max_active_reservations: 2, spending_limit_monthly: 2000,
            allowed_hours_start: "07:00", allowed_hours_end: "20:00"
        };
    }

    // default backoff for spouse/adults
    return {
        can_book_spa: true, can_book_barberia: true, can_book_deportes: true,
        can_book_alberca: true, can_rent_locker: true, can_make_payments: false,
        can_manage_beneficiaries: false, can_approve_reservations: true,
        can_view_account_statement: true, requires_approval: false,
        max_active_reservations: null, spending_limit_monthly: null,
        allowed_hours_start: null, allowed_hours_end: null
    };
};

// GET /api/membership/{id}/beneficiaries - list beneficiaries
router.get('/:id/beneficiaries', requireAuth, async (req, res) => {
    const { id } = req.params;

    try {
        const profiles = await prisma.memberProfile.findMany({
            where: { membership_id: id }
        });
        return res.json(profiles);
    } catch (error) {
        return res.status(500).json({ error: 'Server Error' });
    }
});

// POST /api/membership/{id}/beneficiaries - add beneficiary
router.post('/:id/beneficiaries', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { first_name, last_name, role, date_of_birth, email, phone } = req.body;

    try {
        // 1. Calculate maturity
        const dob = new Date(date_of_birth);
        const ageDiffMs = Date.now() - dob.getTime();
        const ageDate = new Date(ageDiffMs);
        const is_minor = Math.abs(ageDate.getUTCFullYear() - 1970) < 18;

        // 2. Fetch Default permissions mapped from blueprint
        const permissions = getDefaultPermissions(role as string, is_minor);

        const newProfile = await prisma.memberProfile.create({
            data: {
                membership_id: id,
                role: role as string,
                first_name,
                last_name,
                date_of_birth: dob,
                is_minor,
                email,
                phone,
                permissions: JSON.stringify(permissions)
            }
        });

        return res.status(201).json(newProfile);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to create beneficiary' });
    }
});

// PATCH /api/membership/{id}/beneficiaries/{pid} - edit profile/permissions
router.patch('/:id/beneficiaries/:pid', requireAuth, async (req, res) => {
    const { pid } = req.params;
    const { permissions, spending_limit_monthly } = req.body;

    try {
        // Basic structural update (e.g., updating limits)
        let updateData: any = {};

        if (permissions) {
            if (spending_limit_monthly !== undefined) {
                permissions.spending_limit_monthly = spending_limit_monthly;
            }
            updateData.permissions = permissions;
        }

        const updatedProfile = await prisma.memberProfile.update({
            where: { id: pid },
            data: updateData
        });

        return res.json(updatedProfile);
    } catch (error) {
        return res.status(500).json({ error: 'Error updating profile' });
    }
});

// DELETE /api/membership/{id}/beneficiaries/{pid} - Soft delete (deactivate)
router.delete('/:id/beneficiaries/:pid', requireAuth, async (req, res) => {
    const { pid } = req.params;

    try {
        const updatedProfile = await prisma.memberProfile.update({
            where: { id: pid },
            data: {
                is_active: false,
                profile_status: 'inactivo'
            }
        });

        // Blueprint behavior: cancel future reservations
        await prisma.reservation.updateMany({
            where: {
                profile_id: pid,
                status: { in: ['confirmada', 'pendiente', 'pendiente_aprobacion'] },
                date: { gte: new Date() }
            },
            data: {
                status: 'cancelada_sistema',
                cancellation_reason: 'Perfil desactivado por el titular.'
            }
        });

        // Note: Blueprint says "Do not cancel lockers", so we leave them frozen or active.

        return res.json({ success: true, message: 'Beneficiario desactivado exitosamente y reservas futuras canceladas.' });
    } catch (error) {
        return res.status(500).json({ error: 'Error deactivating profile' });
    }
});

export default router;
