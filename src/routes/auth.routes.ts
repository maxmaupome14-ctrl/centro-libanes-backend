import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// POST /api/auth/select-profile
// Step 1: User enters member_number. Backend returns the active profiles.
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

        // Only return non-sensitive fields to the client for selection
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
// Step 2: User selects profile and provides password (or PIN for minors without email)
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

        // Logic: If minor, check PIN. Else check Auth Provider password (simulated here)
        if (profile.is_minor) {
            if (!pin || profile.pin_code !== pin) {
                return res.status(401).json({ error: 'PIN incorrecto' });
            }
        } else {
            // For adults, rely on Auth Provider (e.g. Supabase/Firebase)
            // Here we assume the frontend sends a verified provider token, or we check hash
            if (!password) {
                return res.status(401).json({ error: 'Password o Token requerido' });
            }
            // TODO: Replace with actual verifyPassword(password, profile.auth_user_id)
        }

        // Generate strict JWT token payload containing family roles and permissions
        const tokenPayload = {
            id: profile.id,
            membership_id: profile.membership_id,
            member_number: String(profile.membership.member_number),
            role: profile.role,
            first_name: profile.first_name,
            last_name: profile.last_name,
            is_minor: profile.is_minor,
            permissions: profile.permissions
        };

        // Return mocked JWT (implement sign in real env)
        const token = `mock_jwt_token_${profile.id}`;

        return res.json({ token, user: tokenPayload });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/auth/setup-pin
// Configurar PIN para menor
router.post('/setup-pin', async (req, res) => {
    const { profile_id, new_pin } = req.body;

    // Real world: Requires adult authentication token intercepting this request

    try {
        const profile = await prisma.memberProfile.update({
            where: { id: profile_id },
            data: { pin_code: new_pin }
        });

        return res.json({ success: true, message: 'PIN configurado' });
    } catch (error) {
        return res.status(500).json({ error: 'Error setting PIN' });
    }
});

// POST /api/auth/staff-login
// Employee login: username (staff name) + password
router.post('/staff-login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    try {
        // Look up staff by name (case-insensitive partial match)
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

        // Demo password check (in production, use bcrypt)
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
        return res.status(500).json({ error: error.message || 'Error logging in staff' });
    }
});

export default router;

