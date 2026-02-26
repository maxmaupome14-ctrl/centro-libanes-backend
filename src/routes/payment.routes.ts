import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /api/payments/pending - must be before /:id routes
router.get('/pending', requireAuth, async (req, res) => {
    const user = (req as any).user;

    try {
        const payments = await prisma.payment.findMany({
            where: {
                membership_id: user.membership_id,
                status: 'pendiente',
            },
            orderBy: { created_at: 'desc' },
        });

        return res.json(payments);
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/payments/:id/statement - Estado de Cuenta completo
router.get('/:id/statement', requireAuth, async (req, res) => {
    const { id } = req.params;

    try {
        const membership = await prisma.membership.findUnique({
            where: { id },
            include: {
                profiles: {
                    where: { is_active: true },
                    select: { id: true, first_name: true, last_name: true, role: true }
                },
                maintenance_bills: {
                    orderBy: { due_date: 'desc' },
                    take: 12
                },
                locker_rentals: {
                    include: {
                        locker: true,
                        profile: { select: { first_name: true, last_name: true } }
                    },
                    orderBy: { start_date: 'desc' }
                },
                // Fetch ALL payment types, not just 'servicio'
                payments: {
                    include: {
                        profile: { select: { first_name: true, last_name: true } }
                    },
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

        // Calculate current period
        const now = new Date();
        const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // Group payments by type
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
                profile: payment.profile
                    ? `${payment.profile.first_name} ${payment.profile.last_name}`
                    : 'Titular',
                reference_id: payment.reference_id,
            });
        }

        // Group services by profile name
        const servicesByProfile: Record<string, any[]> = {};
        const servicePayments = membership.payments.filter(p =>
            p.type === 'servicio' || p.type === 'reserva'
        );
        for (const payment of servicePayments) {
            const name = payment.profile
                ? `${payment.profile.first_name} ${payment.profile.last_name}`
                : 'Titular';
            if (!servicesByProfile[name]) servicesByProfile[name] = [];
            servicesByProfile[name].push({
                id: payment.id,
                amount: Number(payment.amount),
                status: payment.status,
                date: payment.created_at,
            });
        }

        // Maintenance summary
        const maintenancePending = membership.maintenance_bills
            .filter(b => b.status === 'pendiente' || b.status === 'vencido');
        const maintenanceDue = maintenancePending
            .reduce((sum, item) => sum + Number(item.amount), 0);

        // Activity enrollment costs
        const enrollmentsDue = membership.enrollments
            .reduce((sum, e) => sum + Number(e.activity.price_monthly || 0), 0);

        // Pending payments
        const pendingPayments = membership.payments
            .filter(p => p.status === 'pendiente')
            .reduce((sum, p) => sum + Number(p.amount), 0);

        const report = {
            membership_number: membership.member_number,
            tier: membership.tier,
            status: membership.status,
            monthly_fee: Number(membership.monthly_fee),
            period: currentPeriod,

            maintenance: membership.maintenance_bills.map(b => ({
                id: b.id,
                period: b.period,
                amount: Number(b.amount),
                due_date: b.due_date,
                status: b.status,
                grace_deadline: b.grace_deadline,
            })),

            services: servicesByProfile,

            lockers: membership.locker_rentals.map(r => ({
                id: r.id,
                locker_number: r.locker.number,
                locker_zone: r.locker.zone,
                locker_size: r.locker.size,
                quarter: r.quarter,
                price: Number(r.price),
                status: r.status,
                auto_renew: r.auto_renew,
                profile: r.profile
                    ? `${r.profile.first_name} ${r.profile.last_name}`
                    : '',
                start_date: r.start_date,
                end_date: r.end_date,
            })),

            enrollments: membership.enrollments.map(e => ({
                id: e.id,
                activity: e.activity.name,
                price_monthly: Number(e.activity.price_monthly || 0),
                profile: `${e.profile.first_name} ${e.profile.last_name}`,
                status: e.status,
            })),

            payments: paymentsByType,

            totals: {
                maintenance_due: maintenanceDue,
                enrollments_monthly: enrollmentsDue,
                pending_payments: pendingPayments,
                total_due: maintenanceDue + pendingPayments,
            },

            family: membership.profiles,
        };

        return res.json(report);
    } catch (err: any) {
        console.error('Statement error:', err);
        return res.status(500).json({ error: 'Error generando estado de cuenta' });
    }
});

// POST /api/payments/checkout - Create payment
router.post('/checkout', requireAuth, async (req, res) => {
    const { amount, source_type, source_id, method } = req.body;
    const user = (req as any).user;

    if (!amount || !source_type) {
        return res.status(400).json({ error: 'amount and source_type are required' });
    }

    try {
        const gatewayTxnId = `kp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const payment = await prisma.payment.create({
            data: {
                membership_id: user.membership_id,
                profile_id: user.id,
                type: source_type,
                amount,
                method: method || 'card',
                status: 'pendiente',
                reference_id: source_id || null,
                gateway_txn_id: gatewayTxnId,
            }
        });

        return res.json({
            payment_id: payment.id,
            gateway_txn_id: gatewayTxnId,
            status: 'pendiente',
            message: 'Pago creado. Confirma con POST /api/payments/:id/confirm'
        });
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/payments/:id/confirm - Confirm payment (gateway callback or manual)
router.post('/:id/confirm', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { gateway_txn_id } = req.body;

    try {
        const payment = await prisma.payment.findUnique({ where: { id } });
        if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });
        if (payment.status === 'completado') {
            return res.json({ message: 'Pago ya fue confirmado', payment });
        }

        const updated = await prisma.payment.update({
            where: { id },
            data: {
                status: 'completado',
                gateway_txn_id: gateway_txn_id || payment.gateway_txn_id,
            }
        });

        // If maintenance payment, mark billing as paid
        if (payment.type === 'mantenimiento' && payment.reference_id) {
            await prisma.maintenanceBilling.updateMany({
                where: { id: payment.reference_id },
                data: { status: 'pagado', payment_id: payment.id }
            });
        }

        // If locker payment, link it
        if (payment.type === 'locker' && payment.reference_id) {
            await prisma.lockerRental.updateMany({
                where: { id: payment.reference_id },
                data: { payment_id: payment.id }
            });
        }

        return res.json({ message: 'Pago confirmado', payment: updated });
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }
});

export default router;
