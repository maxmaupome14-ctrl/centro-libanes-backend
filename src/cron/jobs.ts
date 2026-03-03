import cron from 'node-cron';
import { addMinutes } from 'date-fns';
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

    // ── Every 30 min: check no-shows (15 min past start) ──
    cron.schedule('*/30 * * * *', async () => {
        console.log('[Cron] Checking for no-shows...');
        const now = new Date();
        const fifteenAgo = addMinutes(now, -15);

        const noShows = await prisma.reservation.findMany({
            where: {
                status: 'confirmada',
                start_time: { lt: fifteenAgo },
                date: {
                    gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                    lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
                },
            },
            include: { service: true }
        });

        for (const res of noShows) {
            await prisma.reservation.update({
                where: { id: res.id },
                data: { status: 'cancelada', cancellation_reason: 'No-show automático (15 min)' }
            });

            // Auto-charge no-show fee
            if (res.service && Number(res.service.no_show_fee) > 0) {
                await prisma.payment.create({
                    data: {
                        membership_id: res.membership_id,
                        profile_id: res.profile_id,
                        type: 'no_show',
                        amount: res.service.no_show_fee,
                        status: 'pendiente',
                        reference_id: res.id,
                    }
                });
            }
        }
        if (noShows.length > 0) console.log(`[Cron] Marked ${noShows.length} no-shows`);
    });

    // ── Daily 08:00: reservation reminders for tomorrow ──
    cron.schedule('0 8 * * *', async () => {
        console.log('[Cron] Sending reservation reminders...');
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const dayAfter = new Date(tomorrow);
        dayAfter.setDate(dayAfter.getDate() + 1);

        const upcoming = await prisma.reservation.findMany({
            where: { date: { gte: tomorrow, lt: dayAfter }, status: 'confirmada' },
            include: { profile: true, service: true }
        });

        for (const res of upcoming) {
            await prisma.notification.create({
                data: {
                    recipient_id: res.profile_id,
                    recipient_type: 'member',
                    channel: 'push', type: 'reservation_reminder',
                    title: 'Recordatorio de reserva',
                    body: `Mañana tienes ${res.service?.name || 'una reserva'} a las ${res.start_time.toISOString().slice(11, 16)}`,
                    status: 'pending',
                }
            });
        }
        console.log(`[Cron] Created ${upcoming.length} reminders`);
    });

    // ── Daily 07:00: staff daily agenda ──
    cron.schedule('0 7 * * *', async () => {
        console.log('[Cron] Generating staff daily agendas...');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const staffMembers = await prisma.staff.findMany({ where: { is_active: true } });
        for (const staff of staffMembers) {
            const appointments = await prisma.reservation.count({
                where: { staff_id: staff.id, date: { gte: today, lt: tomorrow }, status: 'confirmada' }
            });
            if (appointments > 0) {
                await prisma.notification.create({
                    data: {
                        recipient_id: staff.id,
                        recipient_type: 'staff',
                        channel: 'push', type: 'daily_agenda',
                        title: 'Tu agenda del día',
                        body: `Tienes ${appointments} cita(s) programada(s) hoy`,
                        status: 'pending',
                    }
                });
            }
        }
    });

    // ── Every 30 min: 2h-before reminders ──
    cron.schedule('*/30 * * * *', async () => {
        const now = new Date();
        const twoHoursFromNow = addMinutes(now, 120);
        const windowEnd = addMinutes(now, 150);

        const upcoming = await prisma.reservation.findMany({
            where: {
                status: 'confirmada',
                start_time: { gte: twoHoursFromNow, lt: windowEnd },
            },
            include: { profile: true, service: true }
        });

        for (const res of upcoming) {
            await prisma.notification.create({
                data: {
                    recipient_id: res.profile_id,
                    recipient_type: 'member',
                    channel: 'push', type: 'reservation_2h_reminder',
                    title: 'Tu reserva es en 2 horas',
                    body: `${res.service?.name || 'Reserva'} a las ${res.start_time.toISOString().slice(11, 16)}`,
                    status: 'pending',
                }
            });
        }
    });

    // ── Day 1 of month 02:00: account statements ──
    cron.schedule('0 2 1 * *', async () => {
        console.log('[Cron] Generating monthly account statements...');
        const memberships = await prisma.membership.findMany({ where: { status: 'activa' } });
        const now = new Date();
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const period = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

        for (const m of memberships) {
            const titular = await prisma.memberProfile.findFirst({
                where: { membership_id: m.id, role: 'titular' }
            });
            if (!titular) continue;

            const payments = await prisma.payment.aggregate({
                _sum: { amount: true },
                where: { membership_id: m.id, created_at: { gte: prevMonth, lt: now } }
            });

            await prisma.notification.create({
                data: {
                    recipient_id: titular.id,
                    recipient_type: 'member',
                    channel: 'email', type: 'account_statement',
                    title: `Estado de cuenta ${period}`,
                    body: `Total del periodo: $${payments._sum.amount || 0} MXN`,
                    status: 'pending',
                }
            });
        }
    });

    // ── Day 1 of Q (Jan, Apr, Jul, Oct): locker preference window ──
    cron.schedule('0 0 1 1,4,7,10 *', async () => {
        console.log('[Cron] Opening locker preference window (48h)...');
        // Log event — actual logic handled by locker service
    });

    // ── Day 3 of Q: release unclaimed lockers ──
    cron.schedule('0 0 3 1,4,7,10 *', async () => {
        console.log('[Cron] Releasing unclaimed preference lockers...');
        // Log event — actual logic handled by locker service
    });

    // ── Weekly Monday 09:00: family spending summary ──
    cron.schedule('0 9 * * 1', async () => {
        console.log('[Cron] Generating weekly family spending summaries...');
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const titulares = await prisma.memberProfile.findMany({
            where: { role: 'titular', is_active: true }
        });

        for (const titular of titulares) {
            const familyPayments = await prisma.payment.aggregate({
                _sum: { amount: true },
                _count: true,
                where: { membership_id: titular.membership_id, created_at: { gte: weekAgo } }
            });

            if (familyPayments._count > 0) {
                await prisma.notification.create({
                    data: {
                        recipient_id: titular.id,
                        recipient_type: 'member',
                        channel: 'push', type: 'weekly_spending',
                        title: 'Resumen semanal de gastos',
                        body: `Tu familia tuvo ${familyPayments._count} cargos por $${familyPayments._sum.amount || 0} MXN esta semana`,
                        status: 'pending',
                    }
                });
            }
        }
    });

    console.log('[Cron] All 14 tasks scheduled successfully.');
}
