import cron from 'node-cron';
import { processLockerRenewals } from '../services/locker.service';
import { generateStaffSettlements } from '../services/settlement.service';
import prisma from '../lib/prisma';

/**
 * Get current and next quarter strings dynamically
 */
function getQuarterStrings() {
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);

    const currentQ = `${year}-Q${quarter}`;
    let nextQ: string;
    if (quarter === 4) {
        nextQ = `${year + 1}-Q1`;
    } else {
        nextQ = `${year}-Q${quarter + 1}`;
    }

    return { currentQ, nextQ };
}

export function setupCronJobs() {
    console.log('[Cron] Initializing scheduled tasks...');

    // Daily 00:05 - check overdue maintenance bills
    cron.schedule('5 0 * * *', async () => {
        console.log('[Cron] Checking overdue maintenance...');

        const overdueBills = await prisma.maintenanceBilling.findMany({
            where: {
                status: { in: ['pendiente', 'vencido'] },
                due_date: { lt: new Date() }
            }
        });

        for (const bill of overdueBills) {
            const msDiff = Date.now() - new Date(bill.due_date).getTime();
            const daysOverdue = Math.floor(msDiff / (1000 * 60 * 60 * 24));

            if (daysOverdue <= 10 && bill.status === 'pendiente') {
                await prisma.maintenanceBilling.update({
                    where: { id: bill.id },
                    data: { status: 'vencido' }
                });
            } else if (daysOverdue > 10) {
                // Suspend membership
                await prisma.membership.update({
                    where: { id: bill.membership_id },
                    data: { status: 'suspendida' }
                });

                // Cancel all active reservations for all family profiles
                const profiles = await prisma.memberProfile.findMany({
                    where: { membership_id: bill.membership_id }
                });

                for (const p of profiles) {
                    await prisma.reservation.updateMany({
                        where: {
                            profile_id: p.id,
                            status: { in: ['pendiente', 'confirmada', 'pendiente_aprobacion'] }
                        },
                        data: {
                            status: 'cancelada',
                            cancellation_reason: 'Membresía suspendida por morosidad'
                        }
                    });
                }
            }
        }
    });

    // Every 30 min - expire pending approvals older than 2 hours
    cron.schedule('*/30 * * * *', async () => {
        console.log('[Cron] Expiring pending approvals > 2 hours...');
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

        await prisma.reservation.updateMany({
            where: {
                status: 'pendiente_aprobacion',
                created_at: { lt: twoHoursAgo }
            },
            data: {
                status: 'expirada',
                cancellation_reason: 'Timeout de aprobación familiar (2 horas)'
            }
        });
    });

    // Day 15 of every month - generate staff settlements
    cron.schedule('0 0 15 * *', async () => {
        console.log('[Cron] Generating settlements for 1st-15th...');
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const periodEnd = new Date(now.getFullYear(), now.getMonth(), 15, 23, 59, 59);
        await generateStaffSettlements(periodStart, periodEnd);
    });

    // Last day of every month - generate staff settlements for 16th-end
    cron.schedule('0 0 28-31 * *', async () => {
        const now = new Date();
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        if (now.getDate() !== lastDay) return; // Only run on actual last day

        console.log('[Cron] Generating settlements for 16th-end...');
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 16);
        const periodEnd = new Date(now.getFullYear(), now.getMonth(), lastDay, 23, 59, 59);
        await generateStaffSettlements(periodStart, periodEnd);
    });

    // Day 25 of Mar, Jun, Sep, Dec - process locker renewals (dynamic quarters)
    cron.schedule('0 0 25 3,6,9,12 *', async () => {
        console.log('[Cron] Processing locker renewals...');
        const { currentQ, nextQ } = getQuarterStrings();
        await processLockerRenewals(currentQ, nextQ);
    });

    // Daily 00:10 - check minor birthdays reaching 18
    cron.schedule('10 0 * * *', async () => {
        console.log('[Cron] Checking minor birthdays reaching 18...');
        const eighteenYearsAgo = new Date();
        eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);

        // Find minors who have turned 18
        const grownUp = await prisma.memberProfile.findMany({
            where: {
                is_minor: true,
                date_of_birth: { lte: eighteenYearsAgo }
            }
        });

        for (const profile of grownUp) {
            // Update to adult with expanded permissions
            const adultPermissions = {
                can_book_spa: true, can_book_barberia: true, can_book_deportes: true,
                can_book_alberca: true, can_rent_locker: true, can_make_payments: false,
                can_manage_beneficiaries: false, can_approve_reservations: false,
                can_view_account_statement: true, requires_approval: false,
                max_active_reservations: null, spending_limit_monthly: null,
                allowed_hours_start: null, allowed_hours_end: null
            };

            await prisma.memberProfile.update({
                where: { id: profile.id },
                data: {
                    is_minor: false,
                    permissions: JSON.stringify(adultPermissions),
                }
            });
        }
    });

    // 1st of every month - generate maintenance bills
    cron.schedule('0 1 1 * *', async () => {
        console.log('[Cron] Generating monthly maintenance bills...');
        const now = new Date();
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const activeMemberships = await prisma.membership.findMany({
            where: { status: 'activa' }
        });

        for (const membership of activeMemberships) {
            // Check if bill already exists for this period
            const existing = await prisma.maintenanceBilling.findFirst({
                where: { membership_id: membership.id, period }
            });

            if (!existing) {
                const dueDate = new Date(now.getFullYear(), now.getMonth(), 10); // Due on the 10th
                const graceDeadline = new Date(now.getFullYear(), now.getMonth(), 20); // Grace until 20th

                await prisma.maintenanceBilling.create({
                    data: {
                        membership_id: membership.id,
                        period,
                        amount: membership.monthly_fee,
                        due_date: dueDate,
                        grace_deadline: graceDeadline,
                        status: 'pendiente',
                    }
                });
            }
        }
    });

    console.log('[Cron] Tasks scheduled successfully.');
}
