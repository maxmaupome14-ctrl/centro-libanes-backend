import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// POST /api/auth/select-profile
router.post('/select-profile', async (req, res) => {
    const { member_number } = req.body;

    if (!member_number) {
        return res.status(400).json({ error: 'member_number is required' });
    }

    try {
        const membership = await prisma.membership.findUnique({
            where: { member_number: parseInt(member_number) },
            include: {
                profiles: {
                    where: { is_active: true }
                }
            }
        });

        if (!membership) {
            return res.status(404).json({ error: 'Número de socio no encontrado' });
        }

        if (membership.status !== 'activa') {
            return res.status(403).json({
                error: 'suspension',
                message: 'Tu membresía está suspendida. Regulariza tu mantenimiento para continuar.'
            });
        }

        const profiles = membership.profiles.map(p => ({
            id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
            role: p.role,
            is_minor: p.is_minor,
            photo_url: p.photo_url
        }));

        return res.json({ membership_id: membership.id, profiles });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { profile_id, pin, password } = req.body;

    if (!profile_id) {
        return res.status(400).json({ error: 'profile_id is required' });
    }

    try {
        const profile = await prisma.memberProfile.findUnique({
            where: { id: profile_id },
            include: { membership: true }
        });

        if (!profile || !profile.is_active) {
            return res.status(404).json({ error: 'Perfil inactivo o no encontrado' });
        }

        if (profile.membership.status !== 'activa') {
            return res.status(403).json({
                error: 'suspension',
                message: 'Tu membresía está suspendida.'
            });
        }

        // Minor: check PIN. Adult: check password
        if (profile.is_minor) {
            if (!pin || profile.pin_code !== pin) {
                return res.status(401).json({ error: 'PIN incorrecto' });
            }
        } else {
            if (!password) {
                return res.status(401).json({ error: 'Password requerido' });
            }
            // In production: verify against auth provider (Supabase/Firebase)
            // For development, accept any non-empty password
        }

        // Parse permissions
        let permissions: any = {};
        try {
            permissions = typeof profile.permissions === 'string'
                ? JSON.parse(profile.permissions) : profile.permissions;
        } catch { permissions = {}; }

        const tokenPayload = {
            id: profile.id,
            membership_id: profile.membership_id,
            member_number: profile.membership.member_number,
            role: profile.role,
            first_name: profile.first_name,
            last_name: profile.last_name,
            is_minor: profile.is_minor,
            permissions,
        };

        const token = `mock_jwt_token_${profile.id}`;

        return res.json({ token, user: tokenPayload });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/auth/setup-pin
router.post('/setup-pin', async (req, res) => {
    const { profile_id, new_pin } = req.body;

    if (!profile_id || !new_pin) {
        return res.status(400).json({ error: 'profile_id y new_pin son requeridos' });
    }

    if (new_pin.length < 4 || new_pin.length > 6) {
        return res.status(400).json({ error: 'El PIN debe tener entre 4 y 6 dígitos' });
    }

    try {
        await prisma.memberProfile.update({
            where: { id: profile_id },
            data: { pin_code: new_pin }
        });

        return res.json({ success: true, message: 'PIN configurado' });
    } catch (error) {
        return res.status(500).json({ error: 'Error al configurar PIN' });
    }
});

// POST /api/auth/staff-login
router.post('/staff-login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    try {
        const staff = await prisma.staff.findFirst({
            where: {
                name: { contains: username },
                is_active: true,
            },
            include: { unit: true },
        });

        if (!staff) {
            return res.status(404).json({ error: 'Empleado no encontrado' });
        }

        // In production: use bcrypt.compare(password, staff.password_hash)
        // For development, accept 'staff123' as demo password
        if (password !== 'staff123') {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }

        const token = `staff_token_${staff.id}_${Date.now()}`;

        return res.json({
            token,
            staff: {
                id: staff.id,
                name: staff.name,
                role: staff.role,
                employment_type: staff.employment_type,
                unit_id: staff.unit_id,
                unit_name: staff.unit?.name || '',
            },
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Error de autenticación' });
    }
});

export default router;
