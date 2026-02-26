import { PrismaClient } from '@prisma/client';
import { addMinutes, isBefore, isAfter, parseISO } from 'date-fns';

const prisma = new PrismaClient();

// Default buffer between appointments
const APPOINTMENT_BUFFER_MINUTES = 10;

/**
 * Calculates available slots for a specific service on a specific date.
 * Takes into account Staff schedules, overrides, and existing reservations.
 */
export async function getAvailableSlots(service_id: string, dateStr: string) {
    const targetDate = new Date(dateStr);

    const service = await prisma.service.findUnique({
        where: { id: service_id },
        include: { staff: { include: { staff: true } } }
    });

    if (!service || !service.is_active) throw new Error("Servicio inactivo o no encontrado");

    const availableStaff = service.staff.filter(s => s.staff.is_active);
    const results = [];

    for (const staffRel of availableStaff) {
        const staff = staffRel.staff;

        // 1. Check overrides
        const override = await prisma.staffScheduleOverride.findFirst({
            where: { staff_id: staff.id, date: targetDate }
        });

        if (override && (override.type === 'dia_libre' || override.type === 'vacaciones')) {
            continue; // Staff not available this day
        }

        // 2. Determine raw working hours
        let startStr, endStr;

        if (override && override.type === 'horario_especial') {
            // Mock parsing for override hours
            startStr = "09:00"; // Should come from override.custom_start
            endStr = "15:00";   // Should come from override.custom_end
        } else {
            const template: any = staff.schedule_template;
            // Convert targetDate to day name (e.g., 'monday')
            const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

            if (!template || !template[dayName]) continue; // Not working this day

            startStr = template[dayName].start;
            endStr = template[dayName].end;
        }

        // 3. Generate 30-min slots mapping 
        // Simplified demonstration of the algorithmic approach specified
        const generatedSlots = ["09:00", "09:30", "10:00"]; // Mock slot generation
        const availableSlots = [];

        // 4. Verify collisions in DB (including soft-locks 'pendiente_aprobacion')
        for (const slotTime of generatedSlots) {
            // Construct exact Date objects for slot start and end
            const slotStart = new Date(`${dateStr}T${slotTime}:00`);
            const slotEnd = addMinutes(slotStart, service.duration_minutes + APPOINTMENT_BUFFER_MINUTES);

            const conflicts = await prisma.reservation.count({
                where: {
                    staff_id: staff.id,
                    date: targetDate,
                    status: { in: ['confirmada', 'en_curso', 'pendiente_aprobacion'] },
                    OR: [
                        { start_time: { lt: slotEnd }, end_time: { gt: slotStart } }
                    ]
                }
            });

            if (conflicts === 0) {
                availableSlots.push(slotTime);
            }
        }

        if (availableSlots.length > 0) {
            results.push({
                staff_id: staff.id,
                staff_name: staff.name,
                slots: availableSlots
            });
        }
    }

    return results;
}

/**
 * Calculates physical court/resource availability
 */
export async function getCanchaSlots(resource_id: string, dateStr: string) {
    const targetDate = new Date(dateStr);

    // Resource hours generally depend on the Unit's club hours.
    // We'll mock a standard 07:00 to 22:00 slot generation every 60 mins.
    const slots = ["07:00", "08:00", "09:00", "10:00", "11:00", "18:00", "19:00"];
    const availableSlots = [];

    for (const slotTime of slots) {
        const slotStart = new Date(`${dateStr}T${slotTime}:00`);
        const slotEnd = addMinutes(slotStart, 60);

        const conflicts = await prisma.reservation.count({
            where: {
                resource_id: resource_id,
                date: targetDate,
                status: { in: ['confirmada', 'en_curso', 'pendiente_aprobacion'] },
                OR: [
                    { start_time: { lt: slotEnd }, end_time: { gt: slotStart } }
                ]
            }
        });

        if (conflicts === 0) {
            availableSlots.push(slotTime);
        }
    }

    return availableSlots;
}

/**
 * Checks if a profile has reached its monthly spending limit
 */
export async function checkSpendingLimit(profile_id: string, membership_id: string, new_charge_amount: number) {
    const profile = await prisma.memberProfile.findUnique({
        where: { id: profile_id }
    });

    if (!profile) throw new Error("Perfil no encontrado");

    const limitData: any = profile.permissions;
    if (!limitData || limitData.spending_limit_monthly === null || limitData.spending_limit_monthly === undefined) {
        return true; // No limit
    }

    const limit = parseFloat(limitData.spending_limit_monthly);

    // Calculate accumulated month spend
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const paymentsResult = await prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
            profile_id: profile_id,
            membership_id: membership_id,
            status: 'completado',
            created_at: { gte: startOfMonth }
        }
    });

    const accumulated = paymentsResult._sum.amount ? parseFloat(paymentsResult._sum.amount.toString()) : 0;

    if (accumulated + new_charge_amount > limit) {
        throw new Error(`Has alcanzado tu límite de gasto mensual ($${accumulated} de $${limit})`);
    }

    return true;
}

/**
 * Approves a pending reservation (Titular / Conyugue action)
 */
export async function approveReservation(reservation_id: string, approved_by_id: string) {
    const reservation = await prisma.reservation.findUnique({ where: { id: reservation_id } });
    if (!reservation || reservation.status !== 'pendiente_aprobacion') {
        throw new Error("Reserva no válida para aprobación");
    }

    // Check if approver is titular or conyugue
    const approver = await prisma.memberProfile.findUnique({ where: { id: approved_by_id } });
    if (!approver || (approver.role !== 'titular' && approver.role !== 'conyugue')) {
        throw new Error("No tienes permiso para aprobar esta reserva");
    }

    return await prisma.reservation.update({
        where: { id: reservation_id },
        data: {
            status: 'confirmada',
            approved_by_id: approved_by_id,
            approved_at: new Date()
        }
    });
}

/**
 * Rejects a pending reservation
 */
export async function rejectReservation(reservation_id: string, rejected_by_id: string) {
    return await prisma.reservation.update({
        where: { id: reservation_id },
        data: {
            status: 'cancelada_titular',
            cancellation_reason: 'Rechazada por el administrador familiar.'
        }
    });
}
