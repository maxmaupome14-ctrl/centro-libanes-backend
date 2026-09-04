"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loanInclude = exports.OPEN_STATUSES = void 0;
exports.getTowelConfig = getTowelConfig;
exports.computeDueAt = computeDueAt;
exports.ensureStock = ensureStock;
exports.moveStock = moveStock;
exports.serializeLoan = serializeLoan;
exports.chargeLoan = chargeLoan;
exports.processTowelOverdues = processTowelOverdues;
exports.setupTowelCrons = setupTowelCrons;
const node_cron_1 = __importDefault(require("node-cron"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const notification_service_1 = require("./notification.service");
/**
 * Control de toallas — reglas de negocio compartidas por rutas y cron.
 *
 * Ciclo de vida de un préstamo (TowelLoan.status):
 *   prestada → devuelta          (el socio regresa todas)
 *   prestada → vencida           (pasó la hora de corte sin devolver)
 *   vencida  → devuelta          (regresó tarde, sin cargo)
 *   vencida  → cobrada           (pasó el periodo de gracia → cargo al estado de cuenta)
 */
exports.OPEN_STATUSES = ['prestada', 'vencida'];
async function getTowelConfig() {
    const cfg = await prisma_1.default.systemConfig.findFirst();
    return {
        fee_lost: Number(cfg?.towel_fee_lost ?? 150),
        max_per_profile: Number(cfg?.towel_max_per_profile ?? 2),
        cutoff_hour: cfg?.towel_cutoff_hour || '22:00',
        grace_days: Number(cfg?.towel_grace_days ?? 1),
    };
}
/** Vence a la hora de corte de hoy (o de mañana si ya pasó la hora de corte). */
function computeDueAt(from, cutoff) {
    const [h, m] = cutoff.split(':').map(n => parseInt(n, 10));
    const due = new Date(from);
    due.setHours(isNaN(h) ? 22 : h, isNaN(m) ? 0 : m, 0, 0);
    if (due <= from)
        due.setDate(due.getDate() + 1);
    return due;
}
async function ensureStock(unit_id) {
    return prisma_1.default.towelStock.upsert({
        where: { unit_id },
        update: {},
        create: { unit_id },
    });
}
/** Mueve toallas entre cubetas (limpias / en uso / lavandería / perdidas) sin dejar negativos. */
async function moveStock(unit_id, delta) {
    const stock = await ensureStock(unit_id);
    return prisma_1.default.towelStock.update({
        where: { unit_id },
        data: {
            clean: Math.max(0, stock.clean + (delta.clean || 0)),
            in_use: Math.max(0, stock.in_use + (delta.in_use || 0)),
            laundry: Math.max(0, stock.laundry + (delta.laundry || 0)),
            lost: Math.max(0, stock.lost + (delta.lost || 0)),
            total: Math.max(0, stock.total + (delta.total || 0)),
        },
    });
}
exports.loanInclude = {
    unit: { select: { id: true, short_name: true } },
    profile: { select: { id: true, first_name: true, last_name: true, role: true } },
    membership: { select: { member_number: true, status: true } },
    issued_by: { select: { id: true, name: true } },
    received_by: { select: { id: true, name: true } },
};
function serializeLoan(loan, now = new Date()) {
    const pending = Math.max(0, loan.quantity - loan.returned_qty);
    const overdue = loan.status === 'vencida' || (loan.status === 'prestada' && new Date(loan.due_at) < now);
    return { ...loan, pending, overdue };
}
/** Cobra las toallas pendientes de un préstamo al estado de cuenta de la membresía. */
async function chargeLoan(loanId, staffId) {
    const cfg = await getTowelConfig();
    const loan = await prisma_1.default.towelLoan.findUnique({ where: { id: loanId } });
    if (!loan)
        throw new Error('Préstamo no encontrado');
    if (loan.status === 'cobrada')
        throw new Error('Este préstamo ya fue cobrado');
    const pending = loan.quantity - loan.returned_qty;
    if (pending <= 0)
        throw new Error('No hay toallas pendientes en este préstamo');
    const amount = pending * cfg.fee_lost;
    const payment = await prisma_1.default.payment.create({
        data: {
            membership_id: loan.membership_id,
            profile_id: loan.profile_id,
            type: 'toalla',
            amount,
            status: 'pendiente',
            reference_id: loan.id,
        },
    });
    const updated = await prisma_1.default.towelLoan.update({
        where: { id: loanId },
        data: {
            status: 'cobrada',
            charged_at: new Date(),
            payment_id: payment.id,
            received_by_id: staffId ?? loan.received_by_id,
        },
        include: exports.loanInclude,
    });
    await moveStock(loan.unit_id, { in_use: -pending, lost: pending });
    await (0, notification_service_1.pushNotification)(loan.profile_id, 'member', 'Cargo por toallas no devueltas', `Se agregó un cargo de $${amount} a tu estado de cuenta por ${pending} toalla(s) no devuelta(s).`, JSON.stringify({ loan_id: loan.id, payment_id: payment.id }), 'towel_charge');
    return { loan: serializeLoan(updated), payment };
}
/** 1) prestada → vencida al pasar la hora de corte. 2) vencida → cobrada al agotar la gracia. */
async function processTowelOverdues() {
    const cfg = await getTowelConfig();
    const now = new Date();
    const overdue = await prisma_1.default.towelLoan.findMany({ where: { status: 'prestada', due_at: { lt: now } } });
    for (const loan of overdue) {
        await prisma_1.default.towelLoan.update({ where: { id: loan.id }, data: { status: 'vencida' } });
        const pending = loan.quantity - loan.returned_qty;
        await (0, notification_service_1.pushNotification)(loan.profile_id, 'member', 'Toallas sin devolver', `Tienes ${pending} toalla(s) del club sin devolver. Entrégalas en vestidores para evitar un cargo de $${cfg.fee_lost} por toalla.`, JSON.stringify({ loan_id: loan.id }), 'towel_overdue');
    }
    const graceCutoff = new Date(now.getTime() - cfg.grace_days * 24 * 60 * 60 * 1000);
    const toCharge = await prisma_1.default.towelLoan.findMany({ where: { status: 'vencida', due_at: { lt: graceCutoff } } });
    let charged = 0;
    for (const loan of toCharge) {
        try {
            await chargeLoan(loan.id);
            charged++;
        }
        catch (e) {
            console.error('[Toallas] No se pudo cobrar el préstamo', loan.id, e);
        }
    }
    return { marked_overdue: overdue.length, charged };
}
function setupTowelCrons() {
    // Cada 30 min: marcar vencidas después de la hora de corte y cobrar las que agotaron la gracia
    node_cron_1.default.schedule('*/30 * * * *', async () => {
        try {
            const r = await processTowelOverdues();
            if (r.marked_overdue || r.charged)
                console.log('[Cron] Toallas:', r);
        }
        catch (e) {
            console.error('[Cron] Toallas error', e);
        }
    });
}
