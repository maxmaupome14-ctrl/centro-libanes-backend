import { Router } from 'express';
import Stripe from 'stripe';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

// GET /api/payments/pending
router.get('/pending', requireAuth, async (req, res) => {
    const user = (req as any).user;
    try {
        const payments = await prisma.payment.findMany({
            where: { membership_id: user.membership_id, status: 'pendiente' },
            orderBy: { created_at: 'desc' },
        });
        return res.json(payments);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/payments/create-intent  - Crea un PaymentIntent de Stripe
router.post('/create-intent', requireAuth, async (req, res) => {
    const { amount, source_type, source_id, currency = 'mxn' } = req.body;
    const user = (req as any).user;

    if (!amount || !source_type) {
        return res.status(400).json({ error: 'amount y source_type son requeridos' });
    }

    try {
        // Crear registro de pago en DB
        const payment = await prisma.payment.create({
            data: {
                membership_id: user.membership_id,
                profile_id: user.id,
                type: source_type,
                amount,
                method: 'card',
                status: 'pendiente',
                reference_id: source_id || null,
            }
        });

        // Si Stripe está configurado, crear PaymentIntent real
        if (stripe) {
            const intent = await stripe.paymentIntents.create({
                amount: Math.round(Number(amount) * 100), // Stripe usa centavos
                currency,
                metadata: {
                    payment_id: payment.id,
                    membership_id: user.membership_id,
                    profile_id: user.id,
                    source_type,
                },
                description: `Centro Libanés - ${source_type} - Socio ${user.member_number}`,
            });

            await prisma.payment.update({
                where: { id: payment.id },
                data: { gateway_txn_id: intent.id }
            });

            return res.json({
                payment_id: payment.id,
                client_secret: intent.client_secret,
                stripe_intent_id: intent.id,
                amount: Number(amount),
                currency,
            });
        }

        // Modo desarrollo sin Stripe
        const fakeClientSecret = `pi_dev_${payment.id}_secret_demo`;
        await prisma.payment.update({
            where: { id: payment.id },
            data: { gateway_txn_id: `pi_dev_${payment.id}` }
        });

        return res.json({
            payment_id: payment.id,
            client_secret: fakeClientSecret,
            stripe_intent_id: `pi_dev_${payment.id}`,
            amount: Number(amount),
            currency,
            dev_mode: true,
            message: 'Stripe no configurado — agrega STRIPE_SECRET_KEY al .env para pagos reales',
        });
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/payments/webhook - Webhook de Stripe (raw body)
router.post('/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripe || !webhookSecret) {
        return res.status(200).json({ received: true, message: 'Stripe no configurado' });
    }

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret);
    } catch (err: any) {
        console.error('Webhook signature error:', err.message);
        return res.status(400).json({ error: `Webhook error: ${err.message}` });
    }

    try {
        if (event.type === 'payment_intent.succeeded') {
            const intent = event.data.object as Stripe.PaymentIntent;
            const paymentId = intent.metadata.payment_id;

            if (paymentId) {
                const payment = await prisma.payment.update({
                    where: { id: paymentId },
                    data: { status: 'completado', gateway_txn_id: intent.id },
                });

                // Actualizar entidad relacionada
                if (payment.type === 'mantenimiento' && payment.reference_id) {
                    await prisma.maintenanceBilling.update({
                        where: { id: payment.reference_id },
                        data: { status: 'pagado', payment_id: payment.id }
                    });

                    // Re-activar membresía si estaba suspendida
                    const membership = await prisma.membership.findUnique({
                        where: { id: payment.membership_id },
                        include: { maintenance_bills: { where: { status: { in: ['pendiente', 'vencido'] } } } }
                    });

                    if (membership && membership.maintenance_bills.length === 0) {
                        await prisma.membership.update({
                            where: { id: payment.membership_id },
                            data: { status: 'activa' }
                        });
                    }
                }

                if (payment.type === 'locker' && payment.reference_id) {
                    await prisma.lockerRental.update({
                        where: { id: payment.reference_id },
                        data: { payment_id: payment.id, status: 'activa' }
                    });
                }

                if (payment.type === 'reserva' && payment.reference_id) {
                    await prisma.reservation.update({
                        where: { id: payment.reference_id },
                        data: { payment_status: 'pagado', payment_id: payment.id }
                    });
                }
            }
        }

        if (event.type === 'payment_intent.payment_failed') {
            const intent = event.data.object as Stripe.PaymentIntent;
            const paymentId = intent.metadata.payment_id;
            if (paymentId) {
                await prisma.payment.update({
                    where: { id: paymentId },
                    data: { status: 'fallido' }
                });
            }
        }

        return res.json({ received: true });
    } catch (err: any) {
        console.error('Webhook processing error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/payments/confirm - Confirmar pago en dev (sin webhook)
router.post('/:id/confirm', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { gateway_txn_id } = req.body;

    try {
        const payment = await prisma.payment.findUnique({ where: { id } });
        if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });
        if (payment.status === 'completado') return res.json({ message: 'Pago ya confirmado', payment });

        const updated = await prisma.payment.update({
            where: { id },
            data: { status: 'completado', gateway_txn_id: gateway_txn_id || payment.gateway_txn_id },
        });

        if (payment.type === 'mantenimiento' && payment.reference_id) {
            await prisma.maintenanceBilling.update({
                where: { id: payment.reference_id },
                data: { status: 'pagado', payment_id: payment.id }
            });
        }

        if (payment.type === 'locker' && payment.reference_id) {
            await prisma.lockerRental.update({
                where: { id: payment.reference_id },
                data: { payment_id: payment.id }
            });
        }

        return res.json({ message: 'Pago confirmado', payment: updated });
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// GET /api/payments/:id/statement
router.get('/:id/statement', requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const membership = await prisma.membership.findUnique({
            where: { id },
            include: {
                profiles: { where: { is_active: true }, select: { id: true, first_name: true, last_name: true, role: true } },
                maintenance_bills: { orderBy: { due_date: 'desc' }, take: 12 },
                locker_rentals: {
                    include: { locker: true, profile: { select: { first_name: true, last_name: true } } },
                    orderBy: { start_date: 'desc' }
                },
                payments: {
                    include: { profile: { select: { first_name: true, last_name: true } } },
                    orderBy: { created_at: 'desc' },
                    take: 50
                },
                enrollments: {
                    where: { status: 'activa' },
                    include: {
                        activity: { select: { name: true, price_monthly: true } },
                        profile: { select: { first_name: true, last_name: true } }
                    }
                }
            }
        });

        if (!membership) return res.status(404).json({ error: 'Membresía no encontrada' });

        const now = new Date();
        const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const paymentsByType: Record<string, any[]> = {};
        for (const payment of membership.payments) {
            const type = payment.type;
            if (!paymentsByType[type]) paymentsByType[type] = [];
            paymentsByType[type].push({
                id: payment.id,
                amount: Number(payment.amount),
                status: payment.status,
                method: payment.method,
                date: payment.created_at,
                profile: payment.profile ? `${payment.profile.first_name} ${payment.profile.last_name}` : 'Titular',
                reference_id: payment.reference_id,
            });
        }

        const maintenancePending = membership.maintenance_bills.filter(b => ['pendiente', 'vencido'].includes(b.status));
        const maintenanceDue = maintenancePending.reduce((sum, item) => sum + Number(item.amount), 0);
        const enrollmentsDue = membership.enrollments.reduce((sum, e) => sum + Number(e.activity.price_monthly || 0), 0);
        const pendingPayments = membership.payments.filter(p => p.status === 'pendiente').reduce((sum, p) => sum + Number(p.amount), 0);

        return res.json({
            membership_number: membership.member_number,
            tier: membership.tier,
            status: membership.status,
            monthly_fee: Number(membership.monthly_fee),
            period: currentPeriod,
            maintenance: membership.maintenance_bills.map(b => ({
                id: b.id, period: b.period, amount: Number(b.amount),
                due_date: b.due_date, status: b.status, grace_deadline: b.grace_deadline,
            })),
            lockers: membership.locker_rentals.map(r => ({
                id: r.id, locker_number: r.locker.number, locker_zone: r.locker.zone,
                locker_size: r.locker.size, quarter: r.quarter, price: Number(r.price),
                status: r.status, auto_renew: r.auto_renew,
                profile: r.profile ? `${r.profile.first_name} ${r.profile.last_name}` : '',
                start_date: r.start_date, end_date: r.end_date,
            })),
            enrollments: membership.enrollments.map(e => ({
                id: e.id, activity: e.activity.name,
                price_monthly: Number(e.activity.price_monthly || 0),
                profile: `${e.profile.first_name} ${e.profile.last_name}`, status: e.status,
            })),
            payments: paymentsByType,
            totals: {
                maintenance_due: maintenanceDue,
                enrollments_monthly: enrollmentsDue,
                pending_payments: pendingPayments,
                total_due: maintenanceDue + pendingPayments,
            },
            family: membership.profiles,
        });
    } catch (err: any) {
        return res.status(500).json({ error: 'Error generando estado de cuenta' });
    }
});

export default router;
