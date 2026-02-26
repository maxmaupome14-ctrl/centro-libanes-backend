import prisma from '../lib/prisma';

/**
 * Generates settlements (Liquidaciones) for independent staff.
 */
export async function generateStaffSettlements(periodStart: Date, periodEnd: Date) {
    const independentStaff = await prisma.staff.findMany({
        where: {
            employment_type: 'independiente',
            is_active: true
        }
    });

    const results = [];

    for (const staff of independentStaff) {
        if (staff.fixed_rent && parseFloat(staff.fixed_rent.toString()) > 0) {
            results.push({ staff: staff.name, type: 'fixed_rent', amount: staff.fixed_rent });
            continue;
        }

        if (!staff.commission_rate) continue;
        const rate = parseFloat(staff.commission_rate.toString());

        const reservations = await prisma.reservation.findMany({
            where: {
                staff_id: staff.id,
                status: 'completada',
                date: { gte: periodStart, lte: periodEnd }
            },
            include: { service: true, payment: true }
        });

        if (reservations.length === 0) continue;

        let grossRevenue = 0;
        for (const res of reservations) {
            if (res.payment && res.payment.status === 'completado') {
                grossRevenue += parseFloat(res.payment.amount.toString());
            }
        }

        const staffPayout = grossRevenue * rate;
        const clubCommission = grossRevenue - staffPayout;

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
