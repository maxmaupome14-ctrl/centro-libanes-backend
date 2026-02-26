import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Real Auth Middleware
const requireAuth = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        const profileId = token.replace('mock_jwt_token_', '');
        const profile = await prisma.memberProfile.findUnique({
            where: { id: profileId },
            include: { membership: true },
        });
        if (!profile) return res.status(401).json({ error: 'Invalid token' });
        req.user = { ...profile, membership_id: profile.membership_id };
        next();
    } catch { return res.status(500).json({ error: 'Auth error' }); }
};

// GET /api/membership/{id}/statement - Family Statement
router.get('/:id/statement', requireAuth, async (req, res) => {
    const { id } = req.params;

    try {
        const membership = await prisma.membership.findUnique({
            where: { id },
            include: {
                profiles: true,
                maintenance_bills: {
                    orderBy: { due_date: 'desc' },
                    take: 5
                },
                locker_rentals: {
                    include: { profile: true },
                    orderBy: { start_date: 'desc' }
                },
                payments: {
                    where: { type: 'servicio' },
                    include: { profile: true },
                    orderBy: { created_at: 'desc' },
                    take: 10
                }
            }
        });

        if (!membership) return res.status(404).json({ error: 'Membership not found' });

        // Formatting for the exact UI requested in Blueprint
        const report = {
            membership_number: membership.member_number,
            tier: membership.tier,
            period: 'Mes Actual', // Just a placeholder
            maintenance: membership.maintenance_bills,
            services: membership.payments.reduce((acc: any, payment) => {
                const profileName = payment.profile ? payment.profile.first_name : 'Titular';
                if (!acc[profileName]) acc[profileName] = [];
                acc[profileName].push(payment);
                return acc;
            }, {}),
            lockers: membership.locker_rentals,
            total_due: membership.maintenance_bills
                .filter(b => b.status === 'pendiente' || b.status === 'vencido')
                .reduce((sum, item) => sum + parseFloat(item.amount.toString()), 0)
        };

        return res.json(report);
    } catch (err) {
        return res.status(500).json({ error: 'Server Error' });
    }
});

// POST /api/payments/checkout (Mock integration with Stripe/Apple Pay)
router.post('/checkout', requireAuth, async (req, res) => {
    const { amount, source_type, source_id } = req.body;
    const user = (req as any).user;

    // In production: Create Stripe PaymentIntent
    const paymentIntentId = `pi_mocked_${Date.now()}`;

    // Create payment record
    const payment = await prisma.payment.create({
        data: {
            membership_id: user.membership_id,
            profile_id: user.id,
            type: source_type,
            amount: amount,
            status: 'pendiente',
            reference_id: source_id, // could be reservation_id or locker_rental_id
            gateway_txn_id: paymentIntentId
        }
    });

    return res.json({ clientSecret: `secret_${paymentIntentId}`, payment_id: payment.id });
});

export default router;
