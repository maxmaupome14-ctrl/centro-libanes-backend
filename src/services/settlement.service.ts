import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Generates settlements (Liquidaciones) for independent staff.
 * Runs on day 15 and the last day of the month.
 */
export async function generateStaffSettlements(periodStart: Date, periodEnd: Date) {
    // 1. Get all independent staff
    const independentStaff = await prisma.staff.findMany({
        where: {
            employment_type: 'independiente',
            is_active: true
        }
    });

    const results = [];

    for (const staff of independentStaff) {
        if (staff.fixed_rent && parseFloat(staff.fixed_rent.toString()) > 0) {
            // Model B: Staff pays fixed rent to club, keeps 100% of revenue.
            // E.g., The club bills fixed_rent monthly to the staff, skipping standard commission split.
            results.push({ staff: staff.name, type: 'fixed_rent', amount: staff.fixed_rent });
            continue;
        }

        if (!staff.commission_rate) continue;
        const rate = parseFloat(staff.commission_rate.toString());

        // 2. Find completed reservations for this period
        const reservations = await prisma.reservation.findMany({
            where: {
                staff_id: staff.id,
                status: 'completada',
                date: {
                    gte: periodStart,
                    lte: periodEnd
                }
            },
            include: {
                service: true,
                payment: true
            }
        });

        if (reservations.length === 0) continue;

        // 3. Calculate financial splits
        let grossRevenue = 0;

        for (const res of reservations) {
            if (res.payment && res.payment.status === 'completado') {
                const amt = parseFloat(res.payment.amount.toString());
                grossRevenue += amt;
            }
        }

        const staffPayout = grossRevenue * rate;
        const clubCommission = grossRevenue - staffPayout;

        // 4. Create the Settlement record
        const settlement = await prisma.staffSettlement.create({
            data: {
                staff_id: staff.id,
                period_start: periodStart,
                period_end: periodEnd,
                total_services: reservations.length,
                gross_revenue: grossRevenue,
                club_commission: clubCommission,
                staff_payout: staffPayout,
                status: 'pendiente'
            }
        });

        results.push(settlement);
    }

    return results;
}
