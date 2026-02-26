import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/catalog
// Combines Services (Spa, classes) and Resources (Tennis, Padel courts) into a unified list
router.get('/', async (req, res) => {
    try {
        const { unit_name } = req.query; // e.g. "Hermes" or "Fredy Atala"

        // Find the unit ID if provided
        let unitFilter = {};
        if (unit_name) {
            const unit = await prisma.unit.findFirst({ where: { short_name: { contains: unit_name as string } } });
            if (unit) {
                unitFilter = { unit_id: unit.id };
            }
        }

        const activities = await prisma.activity.findMany({
            where: { is_active: true, ...unitFilter },
            include: { unit: true, schedules: true }
        });

        const services = await prisma.service.findMany({
            where: { is_active: true, ...unitFilter },
            include: { unit: true }
        });

        const resources = await prisma.resource.findMany({
            where: { is_active: true, ...unitFilter },
            include: { unit: true }
        });

        // Normalize data for the frontend CatalogView
        const combined = [
            ...activities.map(a => ({
                id: a.id,
                type: 'activity',
                name: a.name,
                category: a.category,
                unit: a.unit.name,
                min_age: a.min_age,
                max_age: a.max_age,
                price: Number(a.price_monthly || 0),
                time: a.schedules.length > 0 ? `${a.schedules[0].day_of_week} ${a.schedules[0].start_time}` : 'Varios horarios'
            })),
            ...services.map(s => ({
                id: s.id,
                type: 'service',
                name: s.name,
                category: s.category,
                unit: s.unit.name,
                min_age: 18, // defaults for spa/barberia
                max_age: null,
                price: Number(s.price),
                time: `${s.duration_minutes} min`
            })),
            ...resources.map(r => ({
                id: r.id,
                type: 'resource',
                name: `Reserva de ${r.type || r.name}`,
                category: 'deportes',
                unit: r.unit.name,
                min_age: 12, // Default
                max_age: null,
                price: r.type === 'Padel' ? 250 : (r.type === 'Tenis' ? 150 : 0),
                time: '60 min'
            }))
        ];

        return res.json(combined);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

export default router;
