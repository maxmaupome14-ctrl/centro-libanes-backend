"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushNotification = pushNotification;
exports.sendEmail = sendEmail;
const prisma_1 = __importDefault(require("../lib/prisma"));
/**
 * Handles cross-channel notifications (Push, Email, SMS)
 */
async function pushNotification(recipient_id, recipient_type, title, body, data, type = 'system_alert') {
    const notification = await prisma_1.default.notification.create({
        data: {
            recipient_id,
            recipient_type,
            channel: 'push',
            type,
            title,
            body,
            data: data || null,
            status: 'pending'
        }
    });
    try {
        // In production: await firebaseAdmin.messaging().sendToDevice(token, payload);
        console.log(`[Notification] Sent to ${recipient_id}: ${title} - ${body}`);
        await prisma_1.default.notification.update({
            where: { id: notification.id },
            data: { status: 'sent', sent_at: new Date() }
        });
    }
    catch (error) {
        console.error('Failed to send push notification', error);
        await prisma_1.default.notification.update({
            where: { id: notification.id },
            data: { status: 'failed' }
        });
    }
    return notification;
}
async function sendEmail(recipient_id, recipient_type, subject, template, context) {
    console.log(`[Email] Sending to ${recipient_id} | Subject: ${subject}`);
}
