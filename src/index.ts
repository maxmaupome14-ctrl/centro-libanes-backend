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
import { setupCronJobs } from './cron/jobs';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Main modular routes
app.use('/api/auth', authRoutes);
app.use('/api/membership', familyRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/lockers', lockerRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'centro-libanes-api' });
});

app.listen(port, () => {
    console.log(`[server]: Centro Libanes Backend is running at http://localhost:${port}`);
    setupCronJobs();
});
