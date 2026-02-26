import cron from 'node-cron';
import { processLockerRenewals } from '../services/locker.service';
import { generateStaffSettlements } from '../services/settlement.service';
import { PrismaClient } from '@prisma/client';
import { format, subDays } from 'date-fns';

const prisma = new PrismaClient();

export function setupCronJobs() {
    console.log('[Cron] Initializing scheduled tasks...');

    // Cada día 00:05 - check_overdue_maintenance
    cron.schedule('5 0 * * *', async () => {
        console.log('[Cron] Checking overdue maintenance...');

        // Simplification for the blueprint CRON logic
        const overdueBills = await prisma.maintenanceBilling.findMany({
            where: {
                status: 'pendiente',
                due_date: { lt: new Date() }
            }
        });

        for (const bill of overdueBills) {
            const msDiff = new Date().getTime() - new Date(bill.due_date).getTime();
            const daysOverdue = Math.floor(msDiff / (1000 * 60 * 60 * 24));

            if (daysOverdue <= 10) {
                await prisma.maintenanceBilling.update({
                    where: { id: bill.id },
                    data: { status: 'vencido' }
                });
                // Push Notification: "Tu mantenimiento vencerá..."
            } else {
                // Suspend membership and all family profiles
                await prisma.membership.update({
                    where: { id: bill.membership_id },
                    data: { status: 'suspendida' }
                });

                const profiles = await prisma.memberProfile.findMany({ where: { membership_id: bill.membership_id } });

                for (const p of profiles) {
                    // Cancel reservations
                    await prisma.reservation.updateMany({
                        where: { profile_id: p.id, status: { in: ['pendiente', 'confirmada', 'pendiente_aprobacion'] } },
                        data: { status: 'cancelada_sistema', cancellation_reason: 'Membresía suspendida (morosidad)' }
                    });
                    // Note: Lockers freeze natively if membership status is not 'activa' during renewals
                }
            }
        }
    });

    // Cada 30 min - expire_pending_approvals
    cron.schedule('*/30 * * * *', async () => {
        console.log('[Cron] Expiring pending approvals > 2 hours...');
        const expirationTime = subDays(new Date(), 2 / 24); // subtracting 2 hours approx

        await prisma.reservation.updateMany({
            where: {
                status: 'pendiente_aprobacion',
                created_at: { lt: expirationTime }
            },
            data: {
                status: 'expirada',
                cancellation_reason: 'Timeout de aprobación familiar (2 horas)'
            }
        });
    });

    // Día 15 y último del mes - generate_staff_settlements
    // '0 0 15,L * *'
    cron.schedule('0 0 15 * *', async () => { // Mocking 15th
        console.log('[Cron] Generating Settlements for period -> 15th...');
        // Real implementation requires start/end boundary checks
        await generateStaffSettlements(subDays(new Date(), 15), new Date());
    });

    // Día 25 último mes del Q - process_locker_renewals
    // '0 0 25 3,6,9,12 *'
    cron.schedule('0 0 25 3,6,9,12 *', async () => {
        console.log('[Cron] Processing Locker Renewals...');
        // Determine Q string e.g. "2026-Q1"
        const currentQ = "2026-Q1";
        const nextQ = "2026-Q2";
        await processLockerRenewals(currentQ, nextQ);
    });

    // Cada día 00:10 - check_minor_birthdays
    cron.schedule('10 0 * * *', async () => {
        console.log('[Cron] Checking minor birthdays reaching 18...');
        const limit18Time = new Date();
        limit18Time.setFullYear(limit18Time.getFullYear() - 18);

        await prisma.memberProfile.updateMany({
            where: {
                is_minor: true,
                date_of_birth: { lte: limit18Time }
            },
            data: {
                is_minor: false
                // Advanced mutation would expand permissions here as defined in the blueprint
            }
        });

        // We can also query for the configurable 'beneficiary_max_age' (e.g. 25) 
        // to put limit-reached children into 'transicion'.
    });

    console.log('[Cron] Tasks scheduled successfully.');
}
