import prisma from '../lib/prisma';

/**
 * Handles cross-channel notifications (Push, Email, SMS)
 */
export async function pushNotification(
    recipient_id: string,
    recipient_type: string,
    title: string,
    body: string,
    data?: string
) {
    const notification = await prisma.notification.create({
        data: {
            recipient_id,
            recipient_type,
            channel: 'push',
            type: 'system_alert',
            title,
            body,
            data: data || null,
            status: 'pending'
        }
    });

    try {
        // In production: await firebaseAdmin.messaging().sendToDevice(token, payload);
        console.log(`[Notification] Sent to ${recipient_id}: ${title} - ${body}`);

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

    return notification;
}

export async function sendEmail(
    recipient_id: string,
    recipient_type: string,
    subject: string,
    template: string,
    context: any
) {
    console.log(`[Email] Sending to ${recipient_id} | Subject: ${subject}`);
}
