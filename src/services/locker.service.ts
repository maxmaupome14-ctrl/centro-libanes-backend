import { addMonths } from 'date-fns';
import prisma from '../lib/prisma';

/**
 * Calculate quarter start date for a given quarter string like "2026-Q2"
 */
function getQuarterStartDate(quarterStr: string): Date {
    const [yearStr, qStr] = quarterStr.split('-Q');
    const year = parseInt(yearStr);
    const q = parseInt(qStr);
    const startMonth = (q - 1) * 3; // 0, 3, 6, 9
    return new Date(year, startMonth, 1);
}

/**
 * Calculate quarter end date for a given quarter string
 */
function getQuarterEndDate(quarterStr: string): Date {
    const [yearStr, qStr] = quarterStr.split('-Q');
    const year = parseInt(yearStr);
    const q = parseInt(qStr);
    const endMonth = q * 3; // 3, 6, 9, 12
    const end = new Date(year, endMonth, 0); // last day of previous month
    end.setHours(23, 59, 59, 999);
    return end;
}

/**
 * Automates locker renewals for the next quarter.
 */
export async function processLockerRenewals(currentQuarterStr: string, nextQuarterStr: string) {
    const activeRentals = await prisma.lockerRental.findMany({
        where: {
            quarter: currentQuarterStr,
            status: 'activa',
            auto_renew: true
        },
        include: {
            profile: true,
            membership: true
        }
    });

    const results = [];

    for (const rental of activeRentals) {
        if (rental.membership.status !== 'activa') {
            console.log(`[Locker] Skipping renewal for Locker ${rental.locker_id} - Membership Suspended`);
            results.push({ locker_id: rental.locker_id, status: 'skipped', reason: 'membership_suspended' });
            continue;
        }

        // Check if a rental already exists for next quarter
        const existingNext = await prisma.lockerRental.findFirst({
            where: { locker_id: rental.locker_id, quarter: nextQuarterStr }
        });
        if (existingNext) {
            results.push({ locker_id: rental.locker_id, status: 'skipped', reason: 'already_exists' });
            continue;
        }

        const nextStart = getQuarterStartDate(nextQuarterStr);
        const nextEnd = getQuarterEndDate(nextQuarterStr);

        await prisma.lockerRental.create({
            data: {
                locker_id: rental.locker_id,
                membership_id: rental.membership_id,
                profile_id: rental.profile_id,
                quarter: nextQuarterStr,
                start_date: nextStart,
                end_date: nextEnd,
                price: rental.price,
                status: 'activa',
                auto_renew: true
            }
        });

        results.push({ locker_id: rental.locker_id, status: 'renewed', quarter: nextQuarterStr });
    }

    return results;
}

/**
 * Opens the 48-hour preference window for lockers that were abandoned
 */
export async function lockerPreferenceWindow(currentQuarterStr: string) {
    console.log('[Locker] Processing preference window for ' + currentQuarterStr);
}
