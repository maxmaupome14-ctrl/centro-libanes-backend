import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Starting DB Seed...')

    const hermes = await prisma.unit.upsert({
        where: { code: 'hermes' },
        update: {},
        create: {
            name: 'Unidad Hermes',
            short_name: 'Hermes',
            code: 'hermes',
            address: 'Hermes No. 67, Col. Crédito Constructor',
            city: 'CDMX',
            zip_code: '03940',
            phone: '55 5228 9933',
            operating_hours: JSON.stringify({
                monday: { open: '06:00', close: '22:00' },
                tuesday: { open: '06:00', close: '22:00' },
                wednesday: { open: '06:00', close: '22:00' },
                thursday: { open: '06:00', close: '22:00' },
                friday: { open: '06:00', close: '22:00' },
                saturday: { open: '06:00', close: '22:00' },
                sunday: { open: '06:30', close: '18:00' }
            })
        }
    })

    const fredy = await prisma.unit.upsert({
        where: { code: 'fredy_atala' },
        update: {},
        create: {
            name: 'Unidad Alfredo "Fredy" Atala',
            short_name: 'Fredy Atala',
            code: 'fredy_atala',
            address: 'Av. Glaciar No. 500, Col. Olivar de los Padres',
            city: 'CDMX',
            zip_code: '01780',
            phone: '55 5668 6068',
            operating_hours: JSON.stringify({
                monday: { open: '06:00', close: '22:00' },
                tuesday: { open: '06:00', close: '22:00' },
                wednesday: { open: '06:00', close: '22:00' },
                thursday: { open: '06:00', close: '22:00' },
                friday: { open: '06:00', close: '22:00' },
                saturday: { open: '06:00', close: '20:00' },
                sunday: { open: '06:30', close: '18:00' }
            })
        }
    })

    const actHermes = [
        {
            name: "Basquetbol", cat: "deportes", schedules: [
                { min_age: 4, max_age: 7, label: "4 a 7 años", days: ["tuesday", "thursday"], time: "16:00-17:00" },
                { min_age: 8, max_age: 13, label: "8 a 13 años", days: ["tuesday", "thursday"], time: "17:00-18:00" }
            ]
        },
        {
            name: "Box", cat: "artes_marciales", schedules: [
                { min_age: 8, max_age: 11, label: "8 a 11 años", days: ["monday", "wednesday"], time: "17:00-18:00" },
                { min_age: 12, label: "12 años en adelante", days: ["monday", "wednesday"], time: "18:00-19:00" }
            ]
        },
        {
            name: "Clavados", cat: "acuaticas", schedules: [
                { label: "General", days: ["monday", "tuesday", "wednesday", "thursday"], time: "16:00-18:00" }
            ]
        },
        {
            name: "Ballet", cat: "danza", schedules: [
                { min_age: 3, max_age: 7, label: "3 a 7 años", days: ["tuesday", "thursday"], time: "16:00-17:00" },
                { min_age: 8, max_age: 14, label: "8 a 14 años", days: ["tuesday", "thursday"], time: "17:00-18:00" }
            ]
        }
    ];

    const actFredy = [
        {
            name: "Gimnasio Funcional", cat: "deportes", schedules: [
                { min_age: 18, label: "Adultos", days: ["monday", "wednesday", "friday"], time: "07:00-08:00" }
            ]
        },
        {
            name: "Tenis Clínicas", cat: "deportes", schedules: [
                { label: "General", days: ["saturday", "sunday"], time: "08:00-10:00" }
            ]
        },
        {
            name: "Yoga Vinyasa", cat: "bienestar", schedules: [
                { min_age: 16, label: "Jóvenes y Adultos", days: ["tuesday", "thursday"], time: "19:00-20:00" }
            ]
        }
    ];

    async function createActivities(unitId: string, activities: any[]) {
        for (const act of activities) {
            const createdAct = await prisma.activity.create({
                data: { name: act.name, category: act.cat, unit_id: unitId }
            });
            for (const sched of act.schedules) {
                const times = sched.time.split("-");
                for (const d of sched.days) {
                    await prisma.activitySchedule.create({
                        data: { activity_id: createdAct.id, day_of_week: d, start_time: times[0], end_time: times[1] }
                    })
                }
            }
        }
    }

    await createActivities(hermes.id, actHermes);
    await createActivities(fredy.id, actFredy);

    // Seed User "31505" to resolve the login issue shown by the user
    console.log("Seeding socio 31505 (Max Nicolas)...")
    const membership = await prisma.membership.create({
        data: {
            member_number: 31505,
            tier: 'platino',
            status: 'activa',
            join_date: new Date('2018-05-15'),
            monthly_fee: 8500,
            profiles: {
                create: [
                    {
                        first_name: 'Max',
                        last_name: 'Nicolas',
                        date_of_birth: new Date('1980-01-01'),
                        role: 'titular',
                        is_minor: false,
                        is_active: true,
                        auth_user_id: 'auth_max_123',
                        permissions: JSON.stringify(['all'])
                    },
                    {
                        first_name: 'Andrea',
                        last_name: 'S.',
                        date_of_birth: new Date('1982-05-10'),
                        role: 'conyugue',
                        is_minor: false,
                        is_active: true,
                        auth_user_id: 'auth_andrea_123',
                        permissions: JSON.stringify(['family_read', 'book'])
                    },
                    {
                        first_name: 'Leo',
                        last_name: 'Nicolas',
                        date_of_birth: new Date('2015-08-20'),
                        role: 'hijo',
                        is_minor: true,
                        is_active: true,
                        pin_code: '1234',
                        permissions: JSON.stringify(['book_dependent'])
                    }
                ]
            }
        }
    });
    // Seed Staff
    console.log("Seeding staff members...");
    const staffData = [
        { name: 'Roberto García', role: 'instructor', employment_type: 'planta', unit_id: hermes.id, is_active: true },
        { name: 'María López', role: 'masajista', employment_type: 'comisionista', unit_id: hermes.id, is_active: true },
        { name: 'Carlos Hernández', role: 'coach', employment_type: 'planta', unit_id: fredy.id, is_active: true },
    ];
    for (const s of staffData) {
        await prisma.staff.create({ data: s as any });
    }

    // Seed Lockers
    console.log("Seeding lockers...");
    const sizes = ['chico', 'mediano', 'grande'];
    for (let i = 1; i <= 20; i++) {
        await prisma.locker.create({
            data: {
                unit_id: hermes.id,
                number: `H${i.toString().padStart(3, '0')}`,
                zone: i <= 10 ? 'Caballeros' : 'Damas',
                size: sizes[i % 3],
                condition: 'operativo'
            }
        });
        await prisma.locker.create({
            data: {
                unit_id: fredy.id,
                number: `FA${i.toString().padStart(3, '0')}`,
                zone: i <= 10 ? 'Caballeros' : 'Damas',
                size: sizes[Math.floor(Math.random() * sizes.length)],
                condition: 'operativo'
            }
        });
    }

    console.log('Seeding completed successfully!');
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    });
