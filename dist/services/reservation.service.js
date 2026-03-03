"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailableSlots = getAvailableSlots;
exports.getCanchaSlots = getCanchaSlots;
exports.checkSpendingLimit = checkSpendingLimit;
exports.approveReservation = approveReservation;
exports.rejectReservation = rejectReservation;
const date_fns_1 = require("date-fns");
const prisma_1 = __importDefault(require("../lib/prisma"));
const APPOINTMENT_BUFFER_MINUTES = 10;
/**
 * Generates time slots between start and end times at a given interval.
 */
function generateTimeSlots(startStr, endStr, intervalMinutes) {
    const slots = [];
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    let currentMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    while (currentMinutes + intervalMinutes <= endMinutes) {
        const h = Math.floor(currentMinutes / 60);
        const m = currentMinutes % 60;
        slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        currentMinutes += intervalMinutes;
    }
    return slots;
}
/**
 * Calculates available slots for a service on a given date.
 * Uses staff schedule_template (JSON) and checks for conflicts.
 */
async function getAvailableSlots(service_id, dateStr) {
    const targetDate = new Date(dateStr);
    const service = await prisma_1.default.service.findUnique({
        where: { id: service_id },
        include: { staff: { include: { staff: true } } }
    });
    if (!service || !service.is_active)
        throw new Error("Servicio inactivo o no encontrado");
    const availableStaff = service.staff.filter(s => s.staff.is_active);
    const results = [];
    for (const staffRel of availableStaff) {
        const staff = staffRel.staff;
        // 1. Check overrides
        const override = await prisma_1.default.staffScheduleOverride.findFirst({
            where: { staff_id: staff.id, date: targetDate }
        });
        if (override && (override.type === 'dia_libre' || override.type === 'vacaciones')) {
            continue;
        }
        // 2. Determine working hours
        let startStr;
        let endStr;
        if (override && override.type === 'horario_especial') {
            if (override.custom_start && override.custom_end) {
                // Extract HH:MM from DateTime
                startStr = override.custom_start.toISOString().slice(11, 16);
                endStr = override.custom_end.toISOString().slice(11, 16);
            }
        }
        else if (staff.schedule_template) {
            // Parse JSON string → object
            let template;
            try {
                template = typeof staff.schedule_template === 'string'
                    ? JSON.parse(staff.schedule_template)
                    : staff.schedule_template;
            }
            catch {
                continue;
            }
            // Get day name in lowercase (e.g., 'monday')
            const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
            if (!template[dayName])
                continue;
            startStr = template[dayName].start;
            endStr = template[dayName].end;
        }
        if (!startStr || !endStr)
            continue;
        // 3. Generate real time slots based on service duration
        const slotInterval = service.duration_minutes;
        const generatedSlots = generateTimeSlots(startStr, endStr, slotInterval + APPOINTMENT_BUFFER_MINUTES);
        const availableSlots = [];
        // 4. Check conflicts in DB
        for (const slotTime of generatedSlots) {
            const slotStart = new Date(`${dateStr}T${slotTime}:00`);
            const slotEnd = (0, date_fns_1.addMinutes)(slotStart, service.duration_minutes + APPOINTMENT_BUFFER_MINUTES);
            const conflicts = await prisma_1.default.reservation.count({
                where: {
                    staff_id: staff.id,
                    date: targetDate,
                    status: { in: ['confirmada', 'en_curso', 'pendiente_aprobacion'] },
                    start_time: { lt: slotEnd },
                    end_time: { gt: slotStart },
                }
            });
            if (conflicts === 0) {
                availableSlots.push(slotTime);
            }
        }
        // 5. Check max_concurrent for the service
        if (service.max_concurrent) {
            const filteredSlots = [];
            for (const slotTime of availableSlots) {
                const slotStart = new Date(`${dateStr}T${slotTime}:00`);
                const slotEnd = (0, date_fns_1.addMinutes)(slotStart, service.duration_minutes);
                const concurrent = await prisma_1.default.reservation.count({
                    where: {
                        service_id: service.id,
                        date: targetDate,
                        status: { in: ['confirmada', 'en_curso', 'pendiente_aprobacion'] },
                        start_time: { lt: slotEnd },
                        end_time: { gt: slotStart },
                    }
                });
                if (concurrent < service.max_concurrent) {
                    filteredSlots.push(slotTime);
                }
            }
            if (filteredSlots.length > 0) {
                results.push({ staff_id: staff.id, staff_name: staff.name, slots: filteredSlots });
            }
        }
        else if (availableSlots.length > 0) {
            results.push({ staff_id: staff.id, staff_name: staff.name, slots: availableSlots });
        }
    }
    return results;
}
/**
 * Calculates resource (court) availability using unit operating hours.
 */
async function getCanchaSlots(resource_id, dateStr) {
    const targetDate = new Date(dateStr);
    const resource = await prisma_1.default.resource.findUnique({
        where: { id: resource_id },
        include: { unit: true }
    });
    if (!resource)
        throw new Error("Recurso no encontrado");
    // Parse unit operating hours
    let operatingHours = {};
    if (resource.unit.operating_hours) {
        try {
            operatingHours = JSON.parse(resource.unit.operating_hours);
        }
        catch {
            operatingHours = {};
        }
    }
    const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dayHours = operatingHours[dayName];
    const openTime = dayHours?.open || '07:00';
    const closeTime = dayHours?.close || '22:00';
    // Generate 60-min slots during operating hours
    const allSlots = generateTimeSlots(openTime, closeTime, 60);
    const availableSlots = [];
    for (const slotTime of allSlots) {
        const slotStart = new Date(`${dateStr}T${slotTime}:00`);
        const slotEnd = (0, date_fns_1.addMinutes)(slotStart, 60);
        const conflicts = await prisma_1.default.reservation.count({
            where: {
                resource_id: resource.code,
                date: targetDate,
                status: { in: ['confirmada', 'en_curso', 'pendiente_aprobacion'] },
                start_time: { lt: slotEnd },
                end_time: { gt: slotStart },
            }
        });
        if (conflicts === 0) {
            availableSlots.push(slotTime);
        }
    }
    return availableSlots;
}
/**
 * Checks if a profile has reached its monthly spending limit.
 * Properly parses permissions from JSON string.
 */
async function checkSpendingLimit(profile_id, membership_id, new_charge_amount) {
    const profile = await prisma_1.default.memberProfile.findUnique({
        where: { id: profile_id }
    });
    if (!profile)
        throw new Error("Perfil no encontrado");
    // Parse permissions from JSON string
    let permissions = {};
    try {
        permissions = typeof profile.permissions === 'string'
            ? JSON.parse(profile.permissions)
            : profile.permissions;
    }
    catch {
        return true; // Can't parse = no limit
    }
    if (permissions.spending_limit_monthly === null || permissions.spending_limit_monthly === undefined) {
        return true; // No limit set
    }
    const limit = parseFloat(permissions.spending_limit_monthly);
    if (isNaN(limit))
        return true;
    // Calculate month-to-date spending
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const paymentsResult = await prisma_1.default.payment.aggregate({
        _sum: { amount: true },
        where: {
            profile_id,
            membership_id,
            status: { in: ['completado', 'pendiente'] },
            created_at: { gte: startOfMonth }
        }
    });
    const accumulated = paymentsResult._sum.amount ? parseFloat(paymentsResult._sum.amount.toString()) : 0;
    if (accumulated + new_charge_amount > limit) {
        throw new Error(`Límite de gasto mensual alcanzado ($${accumulated.toFixed(2)} de $${limit.toFixed(2)})`);
    }
    return true;
}
/**
 * Approves a pending reservation (Titular / Conyugue action)
 */
async function approveReservation(reservation_id, approved_by_id) {
    const reservation = await prisma_1.default.reservation.findUnique({ where: { id: reservation_id } });
    if (!reservation || reservation.status !== 'pendiente_aprobacion') {
        throw new Error("Reserva no válida para aprobación");
    }
    const approver = await prisma_1.default.memberProfile.findUnique({ where: { id: approved_by_id } });
    if (!approver || (approver.role !== 'titular' && approver.role !== 'conyugue')) {
        throw new Error("No tienes permiso para aprobar esta reserva");
    }
    return await prisma_1.default.reservation.update({
        where: { id: reservation_id },
        data: {
            status: 'confirmada',
            approved_by_id,
            approved_at: new Date()
        }
    });
}
/**
 * Rejects a pending reservation
 */
async function rejectReservation(reservation_id, rejected_by_id) {
    return await prisma_1.default.reservation.update({
        where: { id: reservation_id },
        data: {
            status: 'rechazada',
            approved_by_id: rejected_by_id,
            approved_at: new Date(),
            cancellation_reason: 'Rechazada por el administrador familiar.'
        }
    });
}
