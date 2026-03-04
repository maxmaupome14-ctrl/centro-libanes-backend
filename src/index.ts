import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import familyRoutes from './routes/family.routes';
import reservationRoutes from './routes/reservation.routes';
import paymentRoutes from './routes/payment.routes';
import catalogRoutes from './routes/catalog.routes';
import lockerRoutes from './routes/locker.routes';
import adminRoutes from './routes/admin.routes';
import profileRoutes from './routes/profile.routes';
import enrollmentRoutes from './routes/enrollment.routes';
import eventsRoutes from './routes/events.routes';
import notificationRoutes from './routes/notification.routes';
import { setupCronJobs } from './cron/jobs';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
// Raw body for Stripe webhook signature verification
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Main modular routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/membership', familyRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/lockers', lockerRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'centro-libanes-api' });
});

app.listen(port, () => {
    console.log(`[server]: Centro Libanes Backend is running at http://localhost:${port}`);
    setupCronJobs();
});
