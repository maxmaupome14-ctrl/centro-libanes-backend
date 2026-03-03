"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || 'centro-libanes-secret-key-2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
// POST /api/auth/select-profile
router.post('/select-profile', async (req, res) => {
    const { member_number } = req.body;
    if (!member_number)
        return res.status(400).json({ error: 'member_number is required' });
    try {
        const membership = await prisma_1.default.membership.findUnique({
            where: { member_number: parseInt(member_number) },
            include: { profiles: { where: { is_active: true } } }
        });
        if (!membership)
            return res.status(404).json({ error: 'Número de socio no encontrado' });
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
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});
// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { profile_id, pin, password } = req.body;
    if (!profile_id)
        return res.status(400).json({ error: 'profile_id is required' });
    try {
        const profile = await prisma_1.default.memberProfile.findUnique({
            where: { id: profile_id },
            include: { membership: true }
        });
        if (!profile || !profile.is_active) {
            return res.status(404).json({ error: 'Perfil inactivo o no encontrado' });
        }
        if (profile.membership.status !== 'activa') {
            return res.status(403).json({ error: 'suspension', message: 'Tu membresía está suspendida.' });
        }
        if (profile.is_minor) {
            if (!pin || profile.pin_code !== pin) {
                return res.status(401).json({ error: 'PIN incorrecto' });
            }
        }
        else {
            if (!password)
                return res.status(401).json({ error: 'Password requerido' });
            // If profile has a hashed password, verify it. Otherwise accept any non-empty (migration period)
            if (profile.password_hash) {
                const valid = await bcryptjs_1.default.compare(password, profile.password_hash);
                if (!valid)
                    return res.status(401).json({ error: 'Contraseña incorrecta' });
            }
        }
        let permissions = {};
        try {
            permissions = typeof profile.permissions === 'string'
                ? JSON.parse(profile.permissions) : profile.permissions;
        }
        catch {
            permissions = {};
        }
        const tokenPayload = {
            id: profile.id,
            membership_id: profile.membership_id,
            member_number: profile.membership.member_number,
            role: profile.role,
            first_name: profile.first_name,
            last_name: profile.last_name,
            is_minor: profile.is_minor,
            permissions,
            type: 'member',
        };
        const token = jsonwebtoken_1.default.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        return res.json({ token, user: tokenPayload });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});
// POST /api/auth/setup-pin
router.post('/setup-pin', async (req, res) => {
    const { profile_id, new_pin } = req.body;
    if (!profile_id || !new_pin)
        return res.status(400).json({ error: 'profile_id y new_pin son requeridos' });
    if (new_pin.length < 4 || new_pin.length > 6)
        return res.status(400).json({ error: 'El PIN debe tener entre 4 y 6 dígitos' });
    try {
        await prisma_1.default.memberProfile.update({ where: { id: profile_id }, data: { pin_code: new_pin } });
        return res.json({ success: true, message: 'PIN configurado' });
    }
    catch (error) {
        return res.status(500).json({ error: 'Error al configurar PIN' });
    }
});
// POST /api/auth/set-password  (for adults to set/change password)
router.post('/set-password', async (req, res) => {
    const { profile_id, password } = req.body;
    if (!profile_id || !password)
        return res.status(400).json({ error: 'profile_id y password son requeridos' });
    if (password.length < 6)
        return res.status(400).json({ error: 'La contraseña debe tener mínimo 6 caracteres' });
    try {
        const hash = await bcryptjs_1.default.hash(password, 12);
        await prisma_1.default.memberProfile.update({ where: { id: profile_id }, data: { password_hash: hash } });
        return res.json({ success: true, message: 'Contraseña configurada' });
    }
    catch (error) {
        return res.status(500).json({ error: 'Error al configurar contraseña' });
    }
});
// POST /api/auth/staff-login
router.post('/staff-login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    try {
        const staff = await prisma_1.default.staff.findFirst({
            where: { name: { contains: username }, is_active: true },
            include: { unit: true },
        });
        if (!staff)
            return res.status(404).json({ error: 'Empleado no encontrado' });
        // If staff has hashed password, verify it. Otherwise use fallback for dev/migration
        if (staff.password_hash) {
            const valid = await bcryptjs_1.default.compare(password, staff.password_hash);
            if (!valid)
                return res.status(401).json({ error: 'Contraseña incorrecta' });
        }
        else {
            // Dev fallback - accept 'staff123'
            if (password !== 'staff123')
                return res.status(401).json({ error: 'Contraseña incorrecta' });
        }
        const tokenPayload = {
            id: staff.id,
            name: staff.name,
            role: staff.role,
            employment_type: staff.employment_type,
            unit_id: staff.unit_id,
            type: 'staff',
        };
        const token = jsonwebtoken_1.default.sign(tokenPayload, JWT_SECRET, { expiresIn: '12h' });
        return res.json({
            token,
            staff: { ...tokenPayload, unit_name: staff.unit?.name || '' },
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Error de autenticación' });
    }
});
exports.default = router;
