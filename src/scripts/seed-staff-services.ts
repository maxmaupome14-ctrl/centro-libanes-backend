import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Map staff roles to service categories
const ROLE_TO_CATEGORY: Record<string, string[]> = {
    peluquero: ['barberia'],
    masajista: ['spa'],
    instructor_fitness: [],
    instructor_tenis: [],
    instructor_padel: [],
    instructor_squash: [],
    instructor_natacion: [],
};

async function main() {
    const staff = await prisma.staff.findMany({ where: { is_active: true } });
    const services = await prisma.service.findMany({ where: { is_active: true } });

    let created = 0;

    for (const s of staff) {
        const categories = ROLE_TO_CATEGORY[s.role] || [];
        if (categories.length === 0) continue;

        // Find services in the same unit + matching category
        const matchingServices = services.filter(
            svc => svc.unit_id === s.unit_id && categories.includes(svc.category)
        );

        for (const svc of matchingServices) {
            try {
                await prisma.staffService.create({
                    data: { staff_id: s.id, service_id: svc.id },
                });
                created++;
                console.log(`  ✓ ${s.name} (${s.role}) → ${svc.name} (${svc.category})`);
            } catch {
                // Already exists (unique constraint)
            }
        }
    }

    console.log(`\nCreated ${created} staff-service links`);
    await prisma.$disconnect();
}

main();
