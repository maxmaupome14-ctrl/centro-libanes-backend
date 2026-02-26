import { PrismaClient } from '@prisma/client';
import { addMonths, subDays } from 'date-fns';

const prisma = new PrismaClient();

/**
 * Automates the renewal of locker rentals for the next quarter.
 * (Run cron on the 25th of the last month of the quarter)
 */
export async function processLockerRenewals(currentQuarterStr: string, nextQuarterStr: string) {
    // 1. Find all active lockers for the current quarter with auto_renew enabled
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

    for (const rental of activeRentals) {
        // 2. Verify parent membership is active
        if (rental.membership.status !== 'activa') {
            // Logic for suspended membership: fail renewal, keep locker assigned but frozen
            console.log(`Skipping renewal for Locker ${rental.locker_id} - Membership Suspended`);
            continue;
        }

        // 3. Attempt payment for next quarter (mock)
        const paymentSuccess = true; // In reality: await processPayment(rental.price, membership)

        if (paymentSuccess) {
            // Create new rental for the next quarter
            await prisma.lockerRental.create({
                data: {
                    locker_id: rental.locker_id,
                    membership_id: rental.membership_id,
                    profile_id: rental.profile_id,
                    quarter: nextQuarterStr,
                    start_date: new Date(), // Replace with strict next quarter start logic
                    end_date: addMonths(new Date(), 3),
                    price: rental.price,
                    status: 'activa',
                    auto_renew: true
                }
            });
            // pushNotification(membership.auth_user_id, 'Tu locker fue renovado');
        } else {
            // Payment Failed: create placeholder pending rental
            await prisma.lockerRental.create({
                data: {
                    locker_id: rental.locker_id,
                    membership_id: rental.membership_id,
                    profile_id: rental.profile_id,
                    quarter: nextQuarterStr,
                    start_date: new Date(),
                    end_date: addMonths(new Date(), 3),
                    price: rental.price,
                    status: 'pendiente',
                    auto_renew: true
                }
            });
            // pushNotification(membership.auth_user_id, 'Pago fallido para tu locker. Tienes hasta el día 1.');
        }
    }
}

/**
 * Opens the 48-hour preference window for lockers that were abandoned
 */
export async function lockerPreferenceWindow(currentQuarterStr: string) {
    // 1. Find lockers without active rental in current quarter
    // 2. Fetch the last rental from previous quarter
    // 3. Notify the former owner they have 48h to claim it.
    console.log('Processing preference window for ' + currentQuarterStr);
}
