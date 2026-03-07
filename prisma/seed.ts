import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

// ── Permissions Templates ──
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

// ── Helper: Load JSON data file ──
function loadJSON(filename: string): any[] {
    const filePath = path.join(__dirname, 'data', filename);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ── Helper: Create activities from JSON array ──
async function createActivities(unitId: string, activities: any[]) {
    for (const act of activities) {
        const createdAct = await prisma.activity.create({
            data: {
                name: act.name,
                category: act.cat,
                description: act.description || null,
                unit_id: unitId,
                included_in_membership: act.included_in_membership ?? true,
                requires_enrollment: act.requires_enrollment ?? true,
                min_age: act.min_age || act.schedules[0]?.min_age || null,
                max_age: act.max_age || act.schedules[0]?.max_age || null,
                min_age_months: act.min_age_months || null,
                max_age_months: act.max_age_months || null,
                age_label: act.age_label || act.schedules[0]?.age || null,
                location_detail: act.schedules[0]?.location || null,
            }
        });
        for (const sched of act.schedules) {
            for (const d of sched.days) {
                await prisma.activitySchedule.create({
                    data: {
                        activity_id: createdAct.id,
                        day_of_week: d,
                        start_time: sched.start,
                        end_time: sched.end,
                    }
                });
            }
        }
    }
}

async function main() {
    console.log('🌱 Starting complete DB Seed...')

    // ══════════════════════════════════════════
    // 1. SYSTEM CONFIG
    // ══════════════════════════════════════════
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
            peak_hours: 'L-V 18:00-21:00, S 08:00-13:00',
        }
    });
    console.log('  ✓ SystemConfig');

    // ══════════════════════════════════════════
    // 2. UNITS
    // ══════════════════════════════════════════
    const hermes = await prisma.unit.upsert({
        where: { code: 'hermes' },
        update: {},
        create: {
            name: 'Unidad Hermes',
            short_name: 'Hermes',
            code: 'hermes',
            address: 'Hermes No. 67, Col. Crédito Constructor, Alcaldía Benito Juárez, C.P. 03940, CDMX',
            city: 'CDMX', zip_code: '03940',
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
    });

    const fredy = await prisma.unit.upsert({
        where: { code: 'fredy_atala' },
        update: {},
        create: {
            name: 'Unidad Alfredo "Fredy" Atala',
            short_name: 'Fredy Atala',
            code: 'fredy_atala',
            address: 'Av. Glaciar No. 500, Col. Olivar de los Padres, Alcaldía Álvaro Obregón, C.P. 01780, CDMX',
            city: 'CDMX', zip_code: '01780',
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
    });
    console.log('  ✓ Units (Hermes + Fredy Atala)');

    // ══════════════════════════════════════════
    // 3. ACTIVITIES (from JSON files)
    // ══════════════════════════════════════════
    const hermesActivities = loadJSON('hermes-activities.json');
    const fredyActivities = loadJSON('fredy-activities.json');
    await createActivities(hermes.id, hermesActivities);
    await createActivities(fredy.id, fredyActivities);
    console.log(`  ✓ Activities: ${hermesActivities.length} Hermes + ${fredyActivities.length} Fredy Atala`);

    // ══════════════════════════════════════════
    // 4. RESOURCES (Physical facilities)
    // ══════════════════════════════════════════
    const resourcesHermes = [
        { code: 'cancha_squash_hermes_1', name: 'Cancha Squash 1', type: 'cancha_squash' },
        { code: 'cancha_fronton_hermes_1', name: 'Cancha Frontón 1', type: 'cancha_fronton' },
        { code: 'cancha_fronton_hermes_2', name: 'Cancha Frontón 2', type: 'cancha_fronton' },
        { code: 'cancha_tenis_hermes_1', name: 'Cancha Tenis 1', type: 'cancha_tenis' },
        { code: 'cancha_tenis_hermes_2', name: 'Cancha Tenis 2', type: 'cancha_tenis' },
        { code: 'carril_alberca_hermes_1', name: 'Carril 1', type: 'carril_alberca' },
        { code: 'carril_alberca_hermes_2', name: 'Carril 2', type: 'carril_alberca' },
        { code: 'carril_alberca_hermes_3', name: 'Carril 3', type: 'carril_alberca' },
        { code: 'carril_alberca_hermes_4', name: 'Carril 4', type: 'carril_alberca' },
        { code: 'carril_alberca_hermes_5', name: 'Carril 5', type: 'carril_alberca' },
        { code: 'carril_alberca_hermes_6', name: 'Carril 6', type: 'carril_alberca' },
        { code: 'fosa_clavados_hermes_1', name: 'Fosa de Clavados', type: 'fosa_clavados' },
        { code: 'sala_masaje_hermes_1', name: 'Sala Masaje 1', type: 'sala_masaje' },
        { code: 'sala_masaje_hermes_2', name: 'Sala Masaje 2', type: 'sala_masaje' },
        { code: 'sillon_barberia_hermes_1', name: 'Sillón Barbería 1', type: 'sillon_barberia' },
        { code: 'sillon_barberia_hermes_2', name: 'Sillón Barbería 2', type: 'sillon_barberia' },
        { code: 'reformer_hermes_1', name: 'Reformer 1', type: 'reformer' },
        { code: 'reformer_hermes_2', name: 'Reformer 2', type: 'reformer' },
        { code: 'reformer_hermes_3', name: 'Reformer 3', type: 'reformer' },
        { code: 'reformer_hermes_4', name: 'Reformer 4', type: 'reformer' },
    ];
    const resourcesFredy = [
        { code: 'cancha_padel_atala_1', name: 'Cancha Pádel 1', type: 'cancha_padel' },
        { code: 'cancha_padel_atala_2', name: 'Cancha Pádel 2', type: 'cancha_padel' },
        { code: 'cancha_tenis_atala_1', name: 'Cancha Tenis 1', type: 'cancha_tenis' },
        { code: 'cancha_tenis_atala_2', name: 'Cancha Tenis 2', type: 'cancha_tenis' },
        { code: 'carril_alberca_atala_1', name: 'Carril 1', type: 'carril_alberca' },
        { code: 'carril_alberca_atala_2', name: 'Carril 2', type: 'carril_alberca' },
        { code: 'carril_alberca_atala_3', name: 'Carril 3', type: 'carril_alberca' },
        { code: 'carril_alberca_atala_4', name: 'Carril 4', type: 'carril_alberca' },
        { code: 'carril_alberca_atala_5', name: 'Carril 5', type: 'carril_alberca' },
        { code: 'carril_alberca_atala_6', name: 'Carril 6', type: 'carril_alberca' },
        { code: 'sala_masaje_atala_1', name: 'Sala Masaje 1', type: 'sala_masaje' },
        { code: 'sala_masaje_atala_2', name: 'Sala Masaje 2', type: 'sala_masaje' },
        { code: 'sillon_barberia_atala_1', name: 'Sillón Barbería 1', type: 'sillon_barberia' },
        { code: 'area_crossfit_atala_1', name: 'Área CrossFit', type: 'area_crossfit' },
        { code: 'cancha_futbol_atala_1', name: 'Cancha Futbol', type: 'cancha_futbol' },
        { code: 'reformer_atala_1', name: 'Reformer 1', type: 'reformer' },
        { code: 'reformer_atala_2', name: 'Reformer 2', type: 'reformer' },
        { code: 'reformer_atala_3', name: 'Reformer 3', type: 'reformer' },
        { code: 'reformer_atala_4', name: 'Reformer 4', type: 'reformer' },
        { code: 'reformer_atala_5', name: 'Reformer 5', type: 'reformer' },
        { code: 'reformer_atala_6', name: 'Reformer 6', type: 'reformer' },
        { code: 'reformer_atala_7', name: 'Reformer 7', type: 'reformer' },
        { code: 'reformer_atala_8', name: 'Reformer 8', type: 'reformer' },
    ];

    for (const r of resourcesHermes) {
        await prisma.resource.upsert({
            where: { code: r.code }, update: {},
            create: { ...r, unit_id: hermes.id, is_active: true },
        });
    }
    for (const r of resourcesFredy) {
        await prisma.resource.upsert({
            where: { code: r.code }, update: {},
            create: { ...r, unit_id: fredy.id, is_active: true },
        });
    }
    console.log(`  ✓ Resources: ${resourcesHermes.length} Hermes + ${resourcesFredy.length} Fredy Atala`);

    // ══════════════════════════════════════════
    // 5. SERVICES (Spa & Barbería — both units)
    // ══════════════════════════════════════════
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
    const allSvcData = [...spaServices, ...barberiaServices];

    for (const unitObj of [hermes, fredy]) {
        for (const svc of allSvcData) {
            await prisma.service.create({
                data: {
                    unit_id: unitObj.id, name: svc.name, category: svc.cat,
                    duration_minutes: svc.duration, price: svc.price,
                    requires_staff: true, is_active: true,
                    cancellation_window: 120, no_show_fee: svc.price * 0.5,
                }
            });
        }
    }
    console.log(`  ✓ Services: ${allSvcData.length} × 2 units`);

    // ══════════════════════════════════════════
    // 6. STAFF (Realistic, per unit)
    // ══════════════════════════════════════════
    const weekdaySchedule = (start: string, end: string) => JSON.stringify({
        monday: { start, end }, tuesday: { start, end },
        wednesday: { start, end }, thursday: { start, end },
        friday: { start, end },
    });
    const fullWeekSchedule = (start: string, end: string) => JSON.stringify({
        monday: { start, end }, tuesday: { start, end },
        wednesday: { start, end }, thursday: { start, end },
        friday: { start, end }, saturday: { start, end },
    });

    const staffData = [
        // Hermes Staff
        { name: 'María López', role: 'masajista', employment_type: 'independiente', unit_id: hermes.id, commission_rate: 0.60, schedule_template: fullWeekSchedule('10:00', '18:00') },
        { name: 'Javier Ramírez', role: 'masajista', employment_type: 'independiente', unit_id: hermes.id, commission_rate: 0.55, schedule_template: weekdaySchedule('09:00', '17:00') },
        { name: 'Ana Martínez', role: 'peluquero', employment_type: 'independiente', unit_id: hermes.id, fixed_rent: 5000, schedule_template: fullWeekSchedule('08:00', '17:00') },
        { name: 'Roberto García', role: 'peluquero', employment_type: 'independiente', unit_id: hermes.id, fixed_rent: 5000, schedule_template: weekdaySchedule('09:00', '18:00') },
        { name: 'Fernando Sánchez', role: 'instructor_tenis', employment_type: 'nomina', unit_id: hermes.id, schedule_template: weekdaySchedule('07:00', '19:00') },
        { name: 'Laura Torres', role: 'instructor_natacion', employment_type: 'nomina', unit_id: hermes.id, schedule_template: weekdaySchedule('06:00', '14:00') },
        { name: 'Carlos Vega', role: 'instructor_squash', employment_type: 'nomina', unit_id: hermes.id, schedule_template: weekdaySchedule('15:00', '21:00') },
        { name: 'Patricia Flores', role: 'instructor_fitness', employment_type: 'nomina', unit_id: hermes.id, schedule_template: weekdaySchedule('06:00', '14:00') },
        // Fredy Atala Staff
        { name: 'Daniela Ramos', role: 'masajista', employment_type: 'independiente', unit_id: fredy.id, commission_rate: 0.60, schedule_template: fullWeekSchedule('09:00', '17:00') },
        { name: 'Ricardo Ortiz', role: 'peluquero', employment_type: 'independiente', unit_id: fredy.id, fixed_rent: 4500, schedule_template: fullWeekSchedule('08:00', '16:00') },
        { name: 'Miguel Herrera', role: 'instructor_padel', employment_type: 'nomina', unit_id: fredy.id, schedule_template: weekdaySchedule('08:00', '20:00') },
        { name: 'Sofía Chávez', role: 'instructor_tenis', employment_type: 'nomina', unit_id: fredy.id, schedule_template: weekdaySchedule('08:00', '19:00') },
        { name: 'Diego Mendoza', role: 'instructor_natacion', employment_type: 'nomina', unit_id: fredy.id, schedule_template: weekdaySchedule('06:30', '14:00') },
        { name: 'Alejandra Ruiz', role: 'instructor_fitness', employment_type: 'nomina', unit_id: fredy.id, schedule_template: weekdaySchedule('06:00', '14:00') },
        { name: 'Iván Castillo', role: 'instructor_fitness', employment_type: 'nomina', unit_id: fredy.id, schedule_template: weekdaySchedule('14:00', '22:00') },
        // Admin
        { name: 'Admin Centro', role: 'administrador', employment_type: 'nomina', unit_id: hermes.id, schedule_template: weekdaySchedule('08:00', '17:00') },
    ];

    const createdStaff = [];
    for (const s of staffData) {
        const staff = await prisma.staff.create({
            data: { ...s, is_active: true } as any
        });
        createdStaff.push(staff);
    }

    // Link staff to services
    const allServices = await prisma.service.findMany();
    for (const staff of createdStaff) {
        const matchingServices = allServices.filter(svc => {
            if (staff.role === 'masajista' && svc.category === 'spa' && svc.unit_id === staff.unit_id) return true;
            if (staff.role === 'peluquero' && svc.category === 'barberia' && svc.unit_id === staff.unit_id) return true;
            return false;
        });
        for (const svc of matchingServices) {
            await prisma.staffService.create({
                data: { staff_id: staff.id, service_id: svc.id }
            });
        }
    }
    console.log(`  ✓ Staff: ${staffData.length} members linked to services`);

    // ══════════════════════════════════════════
    // 7. MEMBERSHIP & PROFILES (31505)
    // ══════════════════════════════════════════
    const membership = await prisma.membership.create({
        data: {
            member_number: 31505,
            tier: 'platino',
            status: 'activa',
            join_date: new Date('2018-05-15'),
            monthly_fee: 4850,
            next_payment_date: new Date('2026-04-10'),
            profiles: {
                create: [
                    {
                        first_name: 'Max', last_name: 'Nicolas Maupome',
                        date_of_birth: new Date('1988-03-15'),
                        role: 'titular', is_minor: false, is_active: true,
                        email: 'max@example.com', phone: '5551234567',
                        auth_user_id: 'auth_max_123',
                        permissions: JSON.stringify(titularPermissions),
                    },
                    {
                        first_name: 'Andrea', last_name: 'S.',
                        date_of_birth: new Date('1991-05-10'),
                        role: 'conyugue', is_minor: false, is_active: true,
                        email: 'andrea@example.com',
                        auth_user_id: 'auth_andrea_123',
                        permissions: JSON.stringify(conyuguePermissions),
                    },
                    {
                        first_name: 'Leo', last_name: 'Nicolas',
                        date_of_birth: new Date('2009-08-20'),
                        role: 'hijo', is_minor: true, is_active: true,
                        pin_code: '1234',
                        permissions: JSON.stringify(hijoMenorPermissions),
                    },
                    {
                        first_name: 'Mía', last_name: 'Nicolas',
                        date_of_birth: new Date('2012-02-14'),
                        role: 'hijo', is_minor: true, is_active: true,
                        pin_code: '5678',
                        permissions: JSON.stringify(hijoMenorPermissions),
                    }
                ]
            }
        }
    });
    console.log('  ✓ Membership 31505 with 4 profiles');

    // ══════════════════════════════════════════
    // 8. LOCKERS (4 zones per unit)
    // ══════════════════════════════════════════
    const lockerZones = ['vestidores_principales', 'zona_spa', 'alberca', 'gimnasio'];
    const sizes: Array<'pequeno' | 'mediano' | 'grande'> = ['pequeno', 'mediano', 'grande'];
    let lockerCount = 0;

    for (const unitObj of [{ id: hermes.id, prefix: 'H' }, { id: fredy.id, prefix: 'FA' }]) {
        for (const zone of lockerZones) {
            const count = zone === 'vestidores_principales' ? 10 : 5;
            for (let i = 1; i <= count; i++) {
                const num = `${unitObj.prefix}-${zone.substring(0, 3).toUpperCase()}-${i.toString().padStart(3, '0')}`;
                await prisma.locker.create({
                    data: {
                        unit_id: unitObj.id, number: num, zone,
                        floor: zone === 'alberca' ? '1er Piso' : 'PB',
                        size: sizes[(i - 1) % 3], condition: 'operativo'
                    }
                });
                lockerCount++;
            }
        }
    }
    console.log(`  ✓ Lockers: ${lockerCount} across both units`);

    // ══════════════════════════════════════════
    // 9. MAINTENANCE BILLING
    // ══════════════════════════════════════════
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevPeriod = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

    await prisma.maintenanceBilling.create({
        data: {
            membership_id: membership.id, period: prevPeriod,
            amount: 4850,
            due_date: new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 10),
            grace_deadline: new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 20),
            status: 'pagado',
        }
    });
    await prisma.maintenanceBilling.create({
        data: {
            membership_id: membership.id, period: currentPeriod,
            amount: 4850,
            due_date: new Date(now.getFullYear(), now.getMonth(), 10),
            grace_deadline: new Date(now.getFullYear(), now.getMonth(), 20),
            status: 'pendiente',
        }
    });
    console.log('  ✓ Maintenance billing (prev paid + current pending)');

    // ══════════════════════════════════════════
    // 10. SAMPLE RESERVATIONS (for demo)
    // ══════════════════════════════════════════
    const profiles = await prisma.memberProfile.findMany({
        where: { membership_id: membership.id }
    });
    const maxProfile = profiles.find(p => p.first_name === 'Max')!;

    // Find a padel court
    const padelCourt = await prisma.resource.findFirst({
        where: { code: 'cancha_padel_atala_1' }
    });

    if (padelCourt) {
        // Tomorrow at 10am
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const startTime = new Date(tomorrow); startTime.setHours(10, 0, 0);
        const endTime = new Date(tomorrow); endTime.setHours(11, 0, 0);

        await prisma.reservation.create({
            data: {
                unit_id: fredy.id, profile_id: maxProfile.id,
                membership_id: membership.id, booked_by_id: maxProfile.id,
                resource_id: padelCourt.code,
                date: tomorrow, start_time: startTime, end_time: endTime,
                status: 'confirmada', payment_status: 'pendiente',
            }
        });
        console.log('  ✓ Sample reservation: Padel tomorrow 10-11am');
    }

    console.log('\n🎉 Seed completed successfully!');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
