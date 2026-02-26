import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Handles cross-channel notifications (Push, Email, SMS)
 * as described in the blueprint.
 */
export async function pushNotification(recipient_id: string, recipient_type: RecipientType, title: string, body: string, data?: any) {

    // 1. Log to DB
    const notification = await prisma.notification.create({
        data: {
            recipient_id,
            recipient_type,
            channel: 'push',
            type: 'system_alert',
            title,
            body,
            data,
            status: 'pending'
        }
    });

    // 2. Integration layer
    try {
        // In production: await firebaseAdmin.messaging().sendToDevice(token, payload);
        console.log(`[Notification via FCM] Sent to ${recipient_id} : ${title} - ${body}`);

        // Mark as sent
        await prisma.notification.update({
            where: { id: notification.id },
            data: { status: 'sent', sent_at: new Date() }
        });

    } catch (error) {
        console.error('Failed to send push notification', error);
        await prisma.notification.update({
            where: { id: notification.id },
            data: { status: 'failed' }
        });
    }
}

export async function sendEmail(recipient_id: string, recipient_type: RecipientType, subject: string, template: string, context: any) {
    console.log(`[Notification via SendGrid] Sending email to ${recipient_id} | Subject: ${subject}`);
}
