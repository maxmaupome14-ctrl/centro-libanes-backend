import { Router } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, requireStaffAuth } from '../middleware/auth';
import { pushNotification } from '../services/notification.service';
import {
    OPEN_STATUSES, getTowelConfig, computeDueAt, ensureStock, moveStock,
    serializeLoan, loanInclude, chargeLoan, processTowelOverdues,
} from '../services/towel.service';

const router = Router();

const profileSelect = {
    id: true, first_name: true, last_name: true, role: true, is_active: true, membership_id: true,
    membership: { select: { id: true, member_number: true, status: true, tier: true } },
};

async function openLoansFor(profile_id: string) {
    const loans = await prisma.towelLoan.findMany({
        where: { profile_id, status: { in: OPEN_STATUSES } },
        include: loanInclude,
        orderBy: { issued_at: 'asc' },
    });
    return loans.map(l => serializeLoan(l));
}

async function buildResolveResponse(profile: any) {
    const cfg = await getTowelConfig();
    const open_loans = await openLoansFor(profile.id);
    const open_count = open_loans.reduce((s: number, l: any) => s + l.pending, 0);
    const family = await prisma.memberProfile.findMany({
        where: { membership_id: profile.membership_id, is_active: true },
        select: { id: true, first_name: true, last_name: true, role: true },
        orderBy: { date_of_birth: 'asc' },
    });
    let reason: string | null = null;
    if (profile.membership.status !== 'activa') reason = 'Membresía suspendida — regularizar en caja';
    else if (open_count >= cfg.max_per_profile) reason = `Ya tiene ${open_count} toalla(s) sin devolver (máximo ${cfg.max_per_profile})`;

    return {
        profile: {
            id: profile.id, first_name: profile.first_name, last_name: profile.last_name, role: profile.role,
            member_number: profile.membership.member_number, membership_status: profile.membership.status, tier: profile.membership.tier,
        },
        family, open_loans, open_count,
        max: cfg.max_per_profile, can_issue: !reason, reason, config: cfg,
    };
}

// GET /api/towels/config
router.get('/config', requireAuth, async (_req: any, res: any) => {
    try { return res.json(await getTowelConfig()); }
    catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// GET /api/towels/my — vista del socio: toallas en su poder, historial, cargos
router.get('/my', requireAuth, async (req: any, res: any) => {
    try {
        if (req.user.type === 'staff') return res.status(403).json({ error: 'Solo socios' });
        const cfg = await getTowelConfig();
        const loans = await prisma.towelLoan.findMany({
            where: { profile_id: req.user.id },
            include: loanInclude,
            orderBy: { issued_at: 'desc' },
            take: 30,
        });
        const all = loans.map(l => serializeLoan(l));
        const familyOpen = await prisma.towelLoan.findMany({
            where: { membership_id: req.user.membership_id, profile_id: { not: req.user.id }, status: { in: OPEN_STATUSES } },
            include: loanInclude,
            orderBy: { issued_at: 'asc' },
        });
        const charges = await prisma.payment.findMany({
            where: { profile_id: req.user.id, type: 'toalla' },
            orderBy: { created_at: 'desc' },
            take: 10,
        });
        return res.json({
            open: all.filter(l => OPEN_STATUSES.includes(l.status)),
            history: all.filter(l => !OPEN_STATUSES.includes(l.status)),
            family_open: familyOpen.map(l => serializeLoan(l)),
            charges,
            config: cfg,
        });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// POST /api/towels/resolve — vestidores: identificar socio por QR (CL-MEMBER:id), número de socio o nombre
router.post('/resolve', requireStaffAuth, async (req: any, res: any) => {
    try {
        const raw = String(req.body.code || '').trim();
        if (!raw) return res.status(400).json({ error: 'Código requerido' });
        const upper = raw.toUpperCase();
        let profile: any = null;

        if (upper.startsWith('CL-MEMBER:')) {
            profile = await prisma.memberProfile.findUnique({ where: { id: raw.slice(10) }, select: profileSelect });
        } else {
            const num = upper.match(/^(?:CL-)?0*(\d+)$/);
            if (num) {
                const membership = await prisma.membership.findUnique({
                    where: { member_number: parseInt(num[1], 10) },
                    include: { profiles: { where: { is_active: true }, select: profileSelect } },
                });
                if (membership) profile = membership.profiles.find((p: any) => p.role === 'titular') || membership.profiles[0] || null;
            } else {
                const found = await prisma.memberProfile.findMany({
                    where: {
                        is_active: true,
                        OR: [
                            { first_name: { contains: raw, mode: 'insensitive' } },
                            { last_name: { contains: raw, mode: 'insensitive' } },
                        ],
                    },
                    select: profileSelect,
                    take: 8,
                    orderBy: { last_name: 'asc' },
                });
                if (found.length === 1) profile = found[0];
                else if (found.length > 1) {
                    return res.json({
                        candidates: found.map((p: any) => ({
                            id: p.id, first_name: p.first_name, last_name: p.last_name, role: p.role,
                            member_number: p.membership.member_number,
                        })),
                    });
                }
            }
        }

        if (!profile || !profile.is_active) return res.status(404).json({ error: 'No se encontró al socio' });
        return res.json(await buildResolveResponse(profile));
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// POST /api/towels/issue — vestidores: entregar toallas a un perfil
router.post('/issue', requireStaffAuth, async (req: any, res: any) => {
    try {
        const { profile_id } = req.body;
        const quantity = parseInt(req.body.quantity ?? 1, 10);
        if (!profile_id || !quantity || quantity < 1) return res.status(400).json({ error: 'profile_id y cantidad válida requeridos' });

        const profile = await prisma.memberProfile.findUnique({ where: { id: profile_id }, select: profileSelect });
        if (!profile || !profile.is_active) return res.status(404).json({ error: 'Socio no encontrado' });
        if (profile.membership.status !== 'activa') return res.status(403).json({ error: 'Membresía suspendida — no se pueden entregar toallas' });

        const cfg = await getTowelConfig();
        const open = await openLoansFor(profile.id);
        const pending = open.reduce((s: number, l: any) => s + l.pending, 0);
        if (pending + quantity > cfg.max_per_profile) {
            return res.status(400).json({ error: `Máximo ${cfg.max_per_profile} toallas por persona (tiene ${pending} sin devolver)` });
        }

        const unit_id = req.staff.unit_id;
        const stock = await ensureStock(unit_id);
        const tracked = stock.total > 0;
        if (tracked && stock.clean < quantity) {
            return res.status(400).json({ error: `Solo quedan ${stock.clean} toallas limpias en ${req.staff.unit?.short_name || 'esta sede'}` });
        }

        const now = new Date();
        const loan = await prisma.towelLoan.create({
            data: {
                unit_id, profile_id: profile.id, membership_id: profile.membership_id,
                issued_by_id: req.staff.id, quantity, due_at: computeDueAt(now, cfg.cutoff_hour),
            },
            include: loanInclude,
        });
        await moveStock(unit_id, { clean: -quantity, in_use: quantity });
        await pushNotification(
            profile.id, 'member',
            'Toallas entregadas',
            `Recibiste ${quantity} toalla(s) en ${req.staff.unit?.short_name || 'el club'}. Devuélvelas antes de las ${cfg.cutoff_hour} hrs.`,
            JSON.stringify({ loan_id: loan.id }),
            'towel_issued',
        );
        return res.status(201).json(serializeLoan(loan));
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// POST /api/towels/:id/return — vestidores: recibir toallas (todas o parciales)
router.post('/:id/return', requireStaffAuth, async (req: any, res: any) => {
    try {
        const loan = await prisma.towelLoan.findUnique({ where: { id: req.params.id } });
        if (!loan) return res.status(404).json({ error: 'Préstamo no encontrado' });
        if (loan.status === 'cobrada') return res.status(400).json({ error: 'Este préstamo ya fue cobrado; para revertirlo contacta administración' });
        const pending = loan.quantity - loan.returned_qty;
        if (pending <= 0) return res.status(400).json({ error: 'No hay toallas pendientes' });

        const requested = parseInt(req.body.quantity ?? pending, 10);
        const qty = Math.min(Math.max(1, isNaN(requested) ? pending : requested), pending);
        const returned_qty = loan.returned_qty + qty;
        const complete = returned_qty >= loan.quantity;

        const updated = await prisma.towelLoan.update({
            where: { id: loan.id },
            data: {
                returned_qty,
                status: complete ? 'devuelta' : loan.status,
                returned_at: complete ? new Date() : null,
                received_by_id: req.staff.id,
            },
            include: loanInclude,
        });
        await moveStock(loan.unit_id, { in_use: -qty, laundry: qty });
        if (complete) {
            await pushNotification(
                loan.profile_id, 'member',
                'Toallas devueltas',
                `Recibimos tus ${loan.quantity} toalla(s). ¡Gracias!`,
                JSON.stringify({ loan_id: loan.id }),
                'towel_returned',
            );
        }
        return res.json(serializeLoan(updated));
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// GET /api/towels/open — préstamos sin devolver (sede del staff; ?all=1 para todas)
router.get('/open', requireStaffAuth, async (req: any, res: any) => {
    try {
        const where: any = { status: { in: OPEN_STATUSES } };
        if (!req.query.all) where.unit_id = req.staff.unit_id;
        const loans = await prisma.towelLoan.findMany({ where, include: loanInclude, orderBy: { issued_at: 'asc' } });
        return res.json(loans.map(l => serializeLoan(l)));
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// GET /api/towels/stock — inventario por sede
router.get('/stock', requireStaffAuth, async (_req: any, res: any) => {
    try {
        const units = await prisma.unit.findMany({
            where: { is_active: true },
            select: { id: true, short_name: true },
            orderBy: { short_name: 'asc' },
        });
        const rows = [];
        for (const u of units) {
            const s = await ensureStock(u.id);
            rows.push({ ...s, unit: u });
        }
        return res.json(rows);
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// PATCH /api/towels/stock/:unitId — ajustes de inventario
//   { action: 'laundry_to_clean', quantity }  → regresan lavadas (cualquier staff de la sede)
//   { action: 'add_new', quantity }           → compra de toallas nuevas (admin)
//   { action: 'set', values: {...} }          → corrección manual (admin)
router.patch('/stock/:unitId', requireStaffAuth, async (req: any, res: any) => {
    try {
        const { action } = req.body;
        const quantity = parseInt(req.body.quantity ?? 0, 10);
        const unit_id = req.params.unitId;
        const isAdmin = req.staff.role === 'administrador';
        if (!isAdmin && unit_id !== req.staff.unit_id) return res.status(403).json({ error: 'Solo puedes ajustar el stock de tu sede' });

        let stock;
        if (action === 'laundry_to_clean') {
            if (!quantity || quantity < 1) return res.status(400).json({ error: 'Cantidad inválida' });
            const cur = await ensureStock(unit_id);
            const q = Math.min(quantity, cur.laundry);
            if (q < 1) return res.status(400).json({ error: 'No hay toallas en lavandería' });
            stock = await moveStock(unit_id, { laundry: -q, clean: q });
        } else if (action === 'add_new') {
            if (!isAdmin) return res.status(403).json({ error: 'Solo administradores' });
            if (!quantity || quantity < 1) return res.status(400).json({ error: 'Cantidad inválida' });
            stock = await moveStock(unit_id, { total: quantity, clean: quantity });
        } else if (action === 'set') {
            if (!isAdmin) return res.status(403).json({ error: 'Solo administradores' });
            const v = req.body.values || {};
            const cur = await ensureStock(unit_id);
            const num = (x: any, fallback: number) => { const n = parseInt(x, 10); return isNaN(n) ? fallback : Math.max(0, n); };
            stock = await prisma.towelStock.update({
                where: { unit_id },
                data: {
                    total: num(v.total, cur.total), clean: num(v.clean, cur.clean), in_use: num(v.in_use, cur.in_use),
                    laundry: num(v.laundry, cur.laundry), lost: num(v.lost, cur.lost),
                },
            });
        } else {
            return res.status(400).json({ error: 'Acción inválida' });
        }
        return res.json(stock);
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// GET /api/towels/summary — tablero del día (sede del staff; ?all=1 para todo el club)
router.get('/summary', requireStaffAuth, async (req: any, res: any) => {
    try {
        const all = !!req.query.all;
        const unit_id = req.staff.unit_id;
        const unitWhere = all ? {} : { unit_id };
        const now = new Date();
        const start = new Date(now); start.setHours(0, 0, 0, 0);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const [issued_today, returned_today, openLoans, cfg, chargedLoans] = await Promise.all([
            prisma.towelLoan.count({ where: { ...unitWhere, issued_at: { gte: start } } }),
            prisma.towelLoan.count({ where: { ...unitWhere, returned_at: { gte: start } } }),
            prisma.towelLoan.findMany({
                where: { ...unitWhere, status: { in: OPEN_STATUSES } },
                select: { quantity: true, returned_qty: true, status: true, due_at: true },
            }),
            getTowelConfig(),
            prisma.towelLoan.findMany({
                where: { ...unitWhere, status: 'cobrada', charged_at: { gte: monthStart } },
                select: { quantity: true, returned_qty: true, payment: { select: { amount: true } } },
            }),
        ]);

        const open = openLoans.reduce((s, l) => s + (l.quantity - l.returned_qty), 0);
        const overdue = openLoans
            .filter(l => l.status === 'vencida' || new Date(l.due_at) < now)
            .reduce((s, l) => s + (l.quantity - l.returned_qty), 0);
        const charged_month_count = chargedLoans.reduce((s, l) => s + (l.quantity - l.returned_qty), 0);
        const charged_month_amount = chargedLoans.reduce((s, l) => s + Number(l.payment?.amount || 0), 0);

        let stock: any;
        let unit: any = null;
        if (all) {
            const rows = await prisma.towelStock.findMany();
            stock = rows.reduce(
                (acc, r) => ({ total: acc.total + r.total, clean: acc.clean + r.clean, in_use: acc.in_use + r.in_use, laundry: acc.laundry + r.laundry, lost: acc.lost + r.lost }),
                { total: 0, clean: 0, in_use: 0, laundry: 0, lost: 0 },
            );
        } else {
            stock = await ensureStock(unit_id);
            unit = await prisma.unit.findUnique({ where: { id: unit_id }, select: { id: true, short_name: true } });
        }

        return res.json({
            unit, stock,
            today: { issued: issued_today, returned: returned_today },
            open, overdue, charged_month_count, charged_month_amount,
            config: cfg,
        });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// POST /api/towels/:id/charge — cobrar toallas no devueltas al estado de cuenta
router.post('/:id/charge', requireStaffAuth, async (req: any, res: any) => {
    try { return res.json(await chargeLoan(req.params.id, req.staff.id)); }
    catch (e: any) { return res.status(400).json({ error: e.message }); }
});

// POST /api/towels/process-overdue — admin: correr el proceso de vencidas/cobros ahora
router.post('/process-overdue', requireStaffAuth, async (req: any, res: any) => {
    if (req.staff.role !== 'administrador') return res.status(403).json({ error: 'Solo administradores' });
    try { return res.json(await processTowelOverdues()); }
    catch (e: any) { return res.status(500).json({ error: e.message }); }
});

export default router;
