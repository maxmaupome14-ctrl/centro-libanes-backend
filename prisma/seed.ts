import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Default permissions by role
const titularPermissions = {
    can_book_spa: true, can_book_barberia: true, can_book_deportes: true,
    can_book_alberca: true, can_rent_locker: true, can_make_payments: true,
    can_manage_beneficiaries: true, can_approve_reservations: true,
    can_view_account_statement: true, requires_approval: false,
    max_active_reservations: null, spending_limit_monthly: null,
    allowed_hours_start: null, allowed_hours_end: null
};

const conyuguePermissions = {
    can_book_spa: true, can_book_barberia: true, can_book_deportes: true,
    can_book_alberca: true, can_rent_locker: true, can_make_payments: false,
    can_manage_beneficiaries: false, can_approve_reservations: true,
    can_view_account_statement: true, requires_approval: false,
    max_active_reservations: null, spending_limit_monthly: null,
    allowed_hours_start: null, allowed_hours_end: null
};

const hijoMenorPermissions = {
    can_book_spa: false, can_book_barberia: false, can_book_deportes: true,
    can_book_alberca: true, can_rent_locker: false, can_make_payments: false,
    can_manage_beneficiaries: false, can_approve_reservations: false,
    can_view_account_statement: false, requires_approval: true,
    max_active_reservations: 2, spending_limit_monthly: 2000,
    allowed_hours_start: "07:00", allowed_hours_end: "20:00"
};

async function main() {
    console.log('Starting DB Seed...')

    // System Config
    await prisma.systemConfig.upsert({
        where: { id: 'default' },
        update: {},
        create: {
            id: 'default',
            maintenance_grace_days: 10,
            reservation_advance_days: 14,
            reservation_same_day: false,
            max_active_reservations_cat: 3,
            cancellation_window_default: 120,
            late_cancel_charge_pct: 0.50,
            no_show_charge_pct: 1.00,
            buffer_between_appointments: 10,
            locker_preference_hours: 48,
            settlement_frequency: 'biweekly',
            beneficiary_max_age: 25,
            club_hours: '06:00-22:00',
            peak_hours: '17:00-21:00',
        }
    });

    // Units
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

    // =========================================
    // ACTIVITIES - Based on centrolibanes.org.mx
    // =========================================

    const actHermes = [
        {
            name: "Academia de Danza", cat: "danza", desc: "Academia de danza y ballet", schedules: [
                { min_age: 4, max_age: 10, label: "4 a 10 años", days: ["tuesday", "thursday"], time: "16:00-18:00" }
            ]
        },
        {
            name: "Aqua Funcional", cat: "acuaticas", desc: "Acondicionamiento en alberca", schedules: [
                { min_age: 15, label: "Mayores de 15 años", days: ["monday", "wednesday", "friday"], time: "10:00-12:00" }
            ]
        },
        {
            name: "Basquetbol", cat: "deportes", desc: "Entrenamientos guiados de basquetbol", schedules: [
                { min_age: 4, max_age: 13, label: "4 a 13 años", days: ["tuesday", "thursday"], time: "16:00-18:00" }
            ]
        },
        {
            name: "Box", cat: "artes_marciales", desc: "Técnica y entrenamiento de box", schedules: [
                { min_age: 8, label: "8 años en adelante", days: ["monday", "wednesday", "friday"], time: "17:00-19:00" }
            ]
        },
        {
            name: "Clavados", cat: "acuaticas", desc: "Iniciación y práctica en fosa", schedules: [
                { min_age: 6, label: "Clase general", days: ["monday", "tuesday", "wednesday", "thursday"], time: "16:00-18:00" }
            ]
        },
        {
            name: "Gimnasio de Pesas", cat: "bienestar", desc: "Acondicionamiento físico general", schedules: [
                { min_age: 15, label: "Mayores de 15 años", days: ["monday", "tuesday", "wednesday", "thursday", "friday"], time: "06:00-22:00" },
                { min_age: 15, label: "Sábados", days: ["saturday"], time: "08:00-16:00" },
                { min_age: 15, label: "Domingos", days: ["sunday"], time: "08:00-14:00" }
            ]
        },
        {
            name: "Natación", cat: "acuaticas", desc: "Clínicas y grupos de natación", schedules: [
                { min_age: 18, label: "Adultos", days: ["monday", "wednesday", "friday"], time: "06:00-14:00" },
                { min_age: 6, max_age: 15, label: "Infantiles", days: ["monday", "wednesday", "friday"], time: "16:00-19:00" }
            ]
        },
        {
            name: "Pilates Reformer", cat: "bienestar", desc: "Pilates en cama especial", schedules: [
                { min_age: 15, label: "Mayores de 15 años AM", days: ["monday", "wednesday", "friday"], time: "07:00-10:00" },
                { min_age: 15, label: "Mayores de 15 años PM", days: ["monday", "wednesday"], time: "17:00-19:00" }
            ]
        },
        {
            name: "Spinning", cat: "bienestar", desc: "Ciclismo indoor y cardio", schedules: [
                { min_age: 15, label: "Mayores de 15 años", days: ["monday", "wednesday", "friday"], time: "07:00-09:00" }
            ]
        },
        {
            name: "Tenis", cat: "deportes", desc: "Clínicas por nivel y categoría", schedules: [
                { min_age: 18, label: "Caballeros", days: ["monday"], time: "07:00-09:00" },
                { min_age: 18, label: "Damas", days: ["monday"], time: "09:00-11:00" },
                { min_age: 6, max_age: 16, label: "Infantiles y juveniles", days: ["thursday"], time: "16:00-18:00" }
            ]
        },
        {
            name: "Yoga", cat: "bienestar", desc: "Hatha y Vinyasa Yoga", schedules: [
                { min_age: 15, label: "Mayores de 15 años", days: ["tuesday", "thursday"], time: "08:30-10:00" }
            ]
        }
    ];

    const actFredy = [
        {
            name: "Acondicionamiento Físico", cat: "bienestar", desc: "Ejercicios coordinados", schedules: [
                { min_age: 6, max_age: 14, label: "Niños", days: ["monday", "tuesday", "wednesday", "thursday"], time: "16:00-18:00" }
            ]
        },
        {
            name: "Aquaerobics", cat: "acuaticas", desc: "Bajo impacto en alberca", schedules: [
                { min_age: 15, label: "Mayores de 15 años", days: ["monday", "tuesday", "wednesday", "thursday"], time: "09:30-10:30" }
            ]
        },
        {
            name: "Aquafitness", cat: "acuaticas", desc: "Alta intensidad en agua", schedules: [
                { min_age: 18, label: "Adultos AM", days: ["monday", "wednesday", "friday"], time: "10:30-11:30" },
                { min_age: 18, label: "Adultos PM", days: ["monday", "wednesday", "friday"], time: "19:00-20:00" }
            ]
        },
        {
            name: "Barre", cat: "bienestar", desc: "Ballet, pilates y yoga integrados", schedules: [
                { min_age: 12, label: "Adolescentes y adultos LMV", days: ["monday", "wednesday", "friday"], time: "10:30-11:30" },
                { min_age: 12, label: "Adolescentes y adultos MJ", days: ["tuesday", "thursday"], time: "09:30-10:30" }
            ]
        },
        {
            name: "Be Cross Fit", cat: "deportes", desc: "Fuerza y acondicionamiento total", schedules: [
                { min_age: 15, label: "Mayores de 15 años AM", days: ["monday", "tuesday", "wednesday", "thursday", "friday"], time: "07:00-09:00" },
                { min_age: 15, label: "Mayores de 15 años PM", days: ["monday", "tuesday", "wednesday", "thursday"], time: "16:00-19:00" }
            ]
        },
        {
            name: "Futbol", cat: "deportes", desc: "Canchas al aire libre", schedules: [
                { min_age: 5, max_age: 15, label: "Niños", days: ["monday", "tuesday", "wednesday", "thursday"], time: "16:00-19:00" },
                { min_age: 12, label: "Femenil L/M", days: ["monday", "wednesday"], time: "16:00-17:30" },
                { min_age: 12, label: "Femenil M/J", days: ["tuesday", "thursday"], time: "17:00-18:30" }
            ]
        },
        {
            name: "Gimnasio de Cardio", cat: "bienestar", desc: "Caminadoras, elípticas y escaladoras", schedules: [
                { min_age: 15, label: "Mayores de 15 años", days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"], time: "06:00-22:00" }
            ]
        },
        {
            name: "Pádel", cat: "deportes", desc: "Deporte de raqueta", schedules: [
                { min_age: 6, max_age: 15, label: "Niños", days: ["monday", "tuesday", "wednesday", "thursday"], time: "16:00-18:00" },
                { min_age: 18, label: "Adultos AM", days: ["monday", "tuesday", "wednesday", "thursday"], time: "09:00-11:00" }
            ]
        },
        {
            name: "Pilates de Cama", cat: "bienestar", desc: "Reformer para rehabilitación y tono", schedules: [
                { min_age: 15, label: "Mayores de 15 años LMV", days: ["monday", "wednesday", "friday"], time: "06:30-09:30" },
                { min_age: 15, label: "Mayores de 15 años MJ", days: ["tuesday", "thursday"], time: "07:30-09:30" }
            ]
        },
        {
            name: "Spinning", cat: "bienestar", desc: "Clase intensa de bicicleta estática", schedules: [
                { min_age: 15, label: "Mayores de 15 LMV", days: ["monday", "wednesday", "friday"], time: "06:30-09:30" },
                { min_age: 15, label: "Mayores de 15 MJ", days: ["tuesday", "thursday"], time: "08:30-10:30" }
            ]
        }
    ];

    async function createActivities(unitId: string, activities: any[]) {
        for (const act of activities) {
            const createdAct = await prisma.activity.create({
                data: {
                    name: act.name,
                    category: act.cat,
                    description: act.desc || null,
                    unit_id: unitId,
                    included_in_membership: true,
                    requires_enrollment: true,
                    min_age: act.schedules[0]?.min_age || null,
                    max_age: act.schedules[0]?.max_age || null,
                    age_label: act.schedules[0]?.label || null,
                }
            });
            for (const sched of act.schedules) {
                const times = sched.time.split("-");
                for (const d of sched.days) {
                    await prisma.activitySchedule.create({
                        data: {
                            activity_id: createdAct.id,
                            day_of_week: d,
                            start_time: times[0],
                            end_time: times[1]
                        }
                    })
                }
            }
        }
    }

    await createActivities(hermes.id, actHermes);
    await createActivities(fredy.id, actFredy);

    // =========================================
    // SERVICES (Spa, Barbería)
    // =========================================
    console.log("Seeding services...");

    const spaServices = [
        { name: 'Masaje Relajante', cat: 'spa', duration: 60, price: 800 },
        { name: 'Masaje Deportivo', cat: 'spa', duration: 45, price: 700 },
        { name: 'Facial Hidratante', cat: 'spa', duration: 50, price: 650 },
        { name: 'Masaje de Piedras Calientes', cat: 'spa', duration: 75, price: 950 },
    ];
    const barberiaServices = [
        { name: 'Corte de Cabello', cat: 'barberia', duration: 30, price: 250 },
        { name: 'Corte y Barba', cat: 'barberia', duration: 45, price: 350 },
        { name: 'Tinte', cat: 'barberia', duration: 60, price: 500 },
    ];

    for (const svc of [...spaServices, ...barberiaServices]) {
        await prisma.service.create({
            data: {
                unit_id: hermes.id,
                name: svc.name,
                category: svc.cat,
                duration_minutes: svc.duration,
                price: svc.price,
                requires_staff: true,
                is_active: true,
                cancellation_window: 120,
                no_show_fee: svc.price * 0.5,
            }
        });
    }

    // =========================================
    // RESOURCES (Canchas)
    // =========================================
    console.log("Seeding resources...");

    const resourcesData = [
        { code: 'cancha_tenis_1', name: 'Cancha de Tenis 1', type: 'Tenis', unit_id: hermes.id },
        { code: 'cancha_tenis_2', name: 'Cancha de Tenis 2', type: 'Tenis', unit_id: hermes.id },
        { code: 'cancha_padel_1', name: 'Cancha de Pádel 1', type: 'Padel', unit_id: hermes.id },
        { code: 'cancha_padel_2', name: 'Cancha de Pádel 2', type: 'Padel', unit_id: hermes.id },
        { code: 'cancha_tenis_fa_1', name: 'Cancha de Tenis 1', type: 'Tenis', unit_id: fredy.id },
        { code: 'cancha_padel_fa_1', name: 'Cancha de Pádel 1', type: 'Padel', unit_id: fredy.id },
    ];

    for (const r of resourcesData) {
        await prisma.resource.upsert({
            where: { code: r.code },
            update: {},
            create: { ...r, is_active: true },
        });
    }

    // =========================================
    // MEMBERSHIP & PROFILES (with correct permissions)
    // =========================================
    console.log("Seeding socio 31505 (Max Nicolas)...");

    const membership = await prisma.membership.create({
        data: {
            member_number: 31505,
            tier: 'platino',
            status: 'activa',
            join_date: new Date('2018-05-15'),
            monthly_fee: 8500,
            next_payment_date: new Date('2026-03-10'),
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
                        permissions: JSON.stringify(titularPermissions),
                    },
                    {
                        first_name: 'Andrea',
                        last_name: 'S.',
                        date_of_birth: new Date('1982-05-10'),
                        role: 'conyugue',
                        is_minor: false,
                        is_active: true,
                        auth_user_id: 'auth_andrea_123',
                        permissions: JSON.stringify(conyuguePermissions),
                    },
                    {
                        first_name: 'Leo',
                        last_name: 'Nicolas',
                        date_of_birth: new Date('2015-08-20'),
                        role: 'hijo',
                        is_minor: true,
                        is_active: true,
                        pin_code: '1234',
                        permissions: JSON.stringify(hijoMenorPermissions),
                    }
                ]
            }
        }
    });

    // =========================================
    // STAFF with schedule_template
    // =========================================
    console.log("Seeding staff members...");

    const staffData = [
        {
            name: 'Roberto García', role: 'instructor', employment_type: 'planta',
            unit_id: hermes.id, is_active: true,
            schedule_template: JSON.stringify({
                monday: { start: '09:00', end: '17:00' },
                tuesday: { start: '09:00', end: '17:00' },
                wednesday: { start: '09:00', end: '17:00' },
                thursday: { start: '09:00', end: '17:00' },
                friday: { start: '09:00', end: '15:00' },
            })
        },
        {
            name: 'María López', role: 'masajista', employment_type: 'comisionista',
            unit_id: hermes.id, is_active: true, commission_rate: 0.60,
            schedule_template: JSON.stringify({
                monday: { start: '10:00', end: '18:00' },
                tuesday: { start: '10:00', end: '18:00' },
                wednesday: { start: '10:00', end: '18:00' },
                thursday: { start: '10:00', end: '18:00' },
                friday: { start: '10:00', end: '16:00' },
                saturday: { start: '09:00', end: '14:00' },
            })
        },
        {
            name: 'Carlos Hernández', role: 'coach', employment_type: 'planta',
            unit_id: fredy.id, is_active: true,
            schedule_template: JSON.stringify({
                monday: { start: '07:00', end: '15:00' },
                tuesday: { start: '07:00', end: '15:00' },
                wednesday: { start: '07:00', end: '15:00' },
                thursday: { start: '07:00', end: '15:00' },
                friday: { start: '07:00', end: '13:00' },
            })
        },
        {
            name: 'Ana Martínez', role: 'esteticista', employment_type: 'independiente',
            unit_id: hermes.id, is_active: true, commission_rate: 0.55,
            schedule_template: JSON.stringify({
                tuesday: { start: '09:00', end: '17:00' },
                thursday: { start: '09:00', end: '17:00' },
                saturday: { start: '09:00', end: '14:00' },
            })
        },
    ];

    const createdStaff = [];
    for (const s of staffData) {
        const staff = await prisma.staff.create({ data: s as any });
        createdStaff.push(staff);
    }

    // Link spa/barberia staff to services
    const allServices = await prisma.service.findMany();
    const spaStaff = createdStaff.filter(s => s.role === 'masajista' || s.role === 'esteticista');
    for (const staff of spaStaff) {
        for (const svc of allServices.filter(s => s.category === 'spa')) {
            await prisma.staffService.create({
                data: { staff_id: staff.id, service_id: svc.id }
            });
        }
    }

    // =========================================
    // LOCKERS
    // =========================================
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
                size: sizes[i % 3],
                condition: 'operativo'
            }
        });
    }

    // =========================================
    // MAINTENANCE BILLING
    // =========================================
    console.log("Seeding maintenance billing...");

    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevPeriod = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

    // Previous month - paid
    await prisma.maintenanceBilling.create({
        data: {
            membership_id: membership.id,
            period: prevPeriod,
            amount: 8500,
            due_date: new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 10),
            grace_deadline: new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 20),
            status: 'pagado',
        }
    });

    // Current month - pending
    await prisma.maintenanceBilling.create({
        data: {
            membership_id: membership.id,
            period: currentPeriod,
            amount: 8500,
            due_date: new Date(now.getFullYear(), now.getMonth(), 10),
            grace_deadline: new Date(now.getFullYear(), now.getMonth(), 20),
            status: 'pendiente',
        }
    });

    console.log('Seeding completed successfully!')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    });
