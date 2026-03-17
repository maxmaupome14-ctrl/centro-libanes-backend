"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const family_routes_1 = __importDefault(require("./routes/family.routes"));
const reservation_routes_1 = __importDefault(require("./routes/reservation.routes"));
const payment_routes_1 = __importDefault(require("./routes/payment.routes"));
const catalog_routes_1 = __importDefault(require("./routes/catalog.routes"));
const locker_routes_1 = __importDefault(require("./routes/locker.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const profile_routes_1 = __importDefault(require("./routes/profile.routes"));
const enrollment_routes_1 = __importDefault(require("./routes/enrollment.routes"));
const events_routes_1 = __importDefault(require("./routes/events.routes"));
const notification_routes_1 = __importDefault(require("./routes/notification.routes"));
const staff_routes_1 = __importDefault(require("./routes/staff.routes"));
const tournament_routes_1 = __importDefault(require("./routes/tournament.routes"));
const guest_routes_1 = __importDefault(require("./routes/guest.routes"));
const waitlist_routes_1 = __importDefault(require("./routes/waitlist.routes"));
const rating_routes_1 = __importDefault(require("./routes/rating.routes"));
const cms_routes_1 = __importDefault(require("./routes/cms.routes"));
const jobs_1 = require("./cron/jobs");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
app.use((0, cors_1.default)());
// Raw body for Stripe webhook signature verification
app.use('/api/payments/webhook', express_1.default.raw({ type: 'application/json' }));
app.use(express_1.default.json());
// Main modular routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/profile', profile_routes_1.default);
app.use('/api/membership', family_routes_1.default);
app.use('/api/reservations', reservation_routes_1.default);
app.use('/api/payments', payment_routes_1.default);
app.use('/api/catalog', catalog_routes_1.default);
app.use('/api/lockers', locker_routes_1.default);
app.use('/api/enrollments', enrollment_routes_1.default);
app.use('/api/events', events_routes_1.default);
app.use('/api/notifications', notification_routes_1.default);
app.use('/api/staff', staff_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api/tournaments', tournament_routes_1.default);
app.use('/api/guests', guest_routes_1.default);
app.use('/api/waitlist', waitlist_routes_1.default);
app.use('/api/ratings', rating_routes_1.default);
app.use('/api/cms', cms_routes_1.default);
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'centro-libanes-api' });
});
// Weather proxy — avoids CORS issues when frontend is on Vercel
app.get('/api/weather', async (req, res) => {
    try {
        const resp = await fetch('https://wttr.in/19.4326,-99.1332?format=j1');
        const data = await resp.json();
        res.json(data);
    }
    catch {
        res.status(502).json({ error: 'Weather service unavailable' });
    }
});
app.listen(port, () => {
    console.log(`[server]: Centro Libanes Backend is running at http://localhost:${port}`);
    (0, jobs_1.setupCronJobs)();
});
