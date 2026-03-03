"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = (0, express_1.Router)();
// GET /api/catalog - all activities, services, resources
router.get('/', async (req, res) => {
    try {
        const { unit_name, category, type } = req.query;
        let unitFilter = {};
        if (unit_name) {
            const unit = await prisma_1.default.unit.findFirst({
                where: { short_name: { contains: unit_name } }
            });
            if (unit)
                unitFilter = { unit_id: unit.id };
        }
        const activities = await prisma_1.default.activity.findMany({
            where: { is_active: true, ...unitFilter },
            include: {
                unit: { select: { name: true, short_name: true } },
                schedules: true,
                instructor: { select: { name: true } },
            }
        });
        const services = await prisma_1.default.service.findMany({
            where: { is_active: true, ...unitFilter },
            include: { unit: { select: { name: true, short_name: true } } }
        });
        const resources = await prisma_1.default.resource.findMany({
            where: { is_active: true, ...unitFilter },
            include: { unit: { select: { name: true, short_name: true } } }
        });
        // Group activity schedules by day for better display
        const formatSchedules = (schedules) => {
            const byDay = {};
            for (const s of schedules) {
                if (!byDay[s.day_of_week])
                    byDay[s.day_of_week] = [];
                byDay[s.day_of_week].push(`${s.start_time}-${s.end_time}`);
            }
            return byDay;
        };
        const combined = [
            ...activities.map(a => ({
                id: a.id,
                type: 'activity',
                name: a.name,
                category: a.category,
                description: a.description,
                unit: a.unit.short_name,
                unit_full: a.unit.name,
                min_age: a.min_age,
                max_age: a.max_age,
                min_age_months: a.min_age_months,
                max_age_months: a.max_age_months,
                age_label: a.age_label,
                level: a.level,
                price_monthly: Number(a.price_monthly || 0),
                included_in_membership: a.included_in_membership,
                requires_enrollment: a.requires_enrollment,
                max_capacity: a.max_capacity,
                instructor: a.instructor?.name || null,
                location: a.location_detail,
                schedules: formatSchedules(a.schedules),
                schedule_display: a.schedules.length > 0
                    ? a.schedules.map(s => `${s.day_of_week} ${s.start_time}-${s.end_time}`).join(', ')
                    : 'Horario por definir',
            })),
            ...services.map(s => ({
                id: s.id,
                type: 'service',
                name: s.name,
                category: s.category,
                description: s.subcategory,
                unit: s.unit.short_name,
                unit_full: s.unit.name,
                min_age: 18,
                max_age: null,
                price: Number(s.price),
                duration_minutes: s.duration_minutes,
                requires_staff: s.requires_staff,
                schedule_display: `${s.duration_minutes} min por sesión`,
            })),
            ...resources.map(r => ({
                id: r.id,
                type: 'resource',
                name: r.name,
                category: 'deportes',
                description: r.type,
                unit: r.unit.short_name,
                unit_full: r.unit.name,
                min_age: 12,
                max_age: null,
                resource_type: r.type,
                schedule_display: '60 min por reservación',
            }))
        ];
        // Optional filtering
        let filtered = combined;
        if (category) {
            filtered = filtered.filter(c => c.category === category);
        }
        if (type) {
            filtered = filtered.filter(c => c.type === type);
        }
        return res.json(filtered);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/catalog/activities/:id - single activity detail with schedules
router.get('/activities/:id', async (req, res) => {
    try {
        const activity = await prisma_1.default.activity.findUnique({
            where: { id: req.params.id },
            include: {
                unit: true,
                schedules: true,
                instructor: { select: { name: true } },
                enrollments: {
                    where: { status: 'activa' },
                    select: { id: true },
                },
            }
        });
        if (!activity)
            return res.status(404).json({ error: 'Actividad no encontrada' });
        return res.json({
            ...activity,
            current_enrollment_count: activity.enrollments.length,
            spots_available: activity.max_capacity
                ? activity.max_capacity - activity.enrollments.length
                : null,
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.default = router;
