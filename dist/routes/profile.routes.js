"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../lib/prisma"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/profile/me - current user's profile + membership summary
router.get('/me', auth_1.requireAuth, async (req, res) => {
    const user = req.user;
    try {
        const profile = await prisma_1.default.memberProfile.findUnique({
            where: { id: user.id },
            include: {
                membership: {
                    include: {
                        profiles: {
                            where: { is_active: true },
                            select: { id: true, first_name: true, last_name: true, role: true, is_minor: true }
                        }
                    }
                }
            }
        });
        if (!profile)
            return res.status(404).json({ error: 'Perfil no encontrado' });
        // Parse permissions
        let permissions = {};
        try {
            permissions = typeof profile.permissions === 'string'
                ? JSON.parse(profile.permissions) : profile.permissions;
        }
        catch {
            permissions = {};
        }
        // Count upcoming reservations
        const upcomingReservations = await prisma_1.default.reservation.count({
            where: {
                profile_id: user.id,
                date: { gte: new Date() },
                status: { in: ['confirmada', 'pendiente_aprobacion'] }
            }
        });
        // Count pending approvals (for titular/conyugue)
        let pendingApprovals = 0;
        if (permissions.can_approve_reservations) {
            pendingApprovals = await prisma_1.default.reservation.count({
                where: {
                    membership_id: user.membership_id,
                    status: 'pendiente_aprobacion',
                }
            });
        }
        // Active lockers
        const activeLockers = await prisma_1.default.lockerRental.count({
            where: { profile_id: user.id, status: 'activa' }
        });
        // Active enrollments
        const activeEnrollments = await prisma_1.default.activityEnrollment.count({
            where: { profile_id: user.id, status: 'activa' }
        });
        // Pending maintenance
        const pendingMaintenance = await prisma_1.default.maintenanceBilling.findFirst({
            where: {
                membership_id: user.membership_id,
                status: { in: ['pendiente', 'vencido'] }
            },
            orderBy: { due_date: 'desc' }
        });
        return res.json({
            id: profile.id,
            first_name: profile.first_name,
            last_name: profile.last_name,
            role: profile.role,
            email: profile.email,
            phone: profile.phone,
            date_of_birth: profile.date_of_birth,
            is_minor: profile.is_minor,
            photo_url: profile.photo_url,
            permissions,
            membership: {
                id: profile.membership.id,
                member_number: profile.membership.member_number,
                tier: profile.membership.tier,
                status: profile.membership.status,
                monthly_fee: Number(profile.membership.monthly_fee),
                family_members: profile.membership.profiles,
            },
            summary: {
                upcoming_reservations: upcomingReservations,
                pending_approvals: pendingApprovals,
                active_lockers: activeLockers,
                active_enrollments: activeEnrollments,
                has_pending_maintenance: !!pendingMaintenance,
                maintenance_status: pendingMaintenance?.status || 'al_corriente',
            }
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
