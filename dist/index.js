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
app.use('/api/admin', admin_routes_1.default);
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'centro-libanes-api' });
});
app.listen(port, () => {
    console.log(`[server]: Centro Libanes Backend is running at http://localhost:${port}`);
    (0, jobs_1.setupCronJobs)();
});
