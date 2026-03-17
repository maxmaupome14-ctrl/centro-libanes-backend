"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = __importDefault(require("../lib/prisma"));
const router = (0, express_1.Router)();
// ── Featured Items ─────────────────────────────────────────
// GET /api/cms/featured — public, for frontend HomeView
router.get('/featured', async (_req, res) => {
    try {
        const items = await prisma_1.default.featuredItem.findMany({
            where: { is_active: true },
            orderBy: { display_order: 'asc' },
        });
        return res.json(items);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/cms/featured/all — admin, includes inactive
router.get('/featured/all', async (_req, res) => {
    try {
        const items = await prisma_1.default.featuredItem.findMany({ orderBy: { display_order: 'asc' } });
        return res.json(items);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/cms/featured
router.post('/featured', async (req, res) => {
    const { title, subtitle, gradient_start, gradient_end, icon, link, image_url, display_order } = req.body;
    if (!title)
        return res.status(400).json({ error: 'title es requerido' });
    try {
        const item = await prisma_1.default.featuredItem.create({
            data: { title, subtitle, gradient_start, gradient_end, icon, link, image_url, display_order: display_order || 0, is_active: true },
        });
        return res.status(201).json(item);
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// PATCH /api/cms/featured/:id
router.patch('/featured/:id', async (req, res) => {
    try {
        const item = await prisma_1.default.featuredItem.update({ where: { id: req.params.id }, data: req.body });
        return res.json(item);
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// DELETE /api/cms/featured/:id
router.delete('/featured/:id', async (req, res) => {
    try {
        await prisma_1.default.featuredItem.delete({ where: { id: req.params.id } });
        return res.json({ message: 'Eliminado' });
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// ── Explore Items ──────────────────────────────────────────
// GET /api/cms/explore — public
router.get('/explore', async (_req, res) => {
    try {
        const items = await prisma_1.default.exploreItem.findMany({
            where: { is_active: true },
            orderBy: { display_order: 'asc' },
        });
        return res.json(items);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/cms/explore/all — admin
router.get('/explore/all', async (_req, res) => {
    try {
        const items = await prisma_1.default.exploreItem.findMany({ orderBy: { display_order: 'asc' } });
        return res.json(items);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/cms/explore
router.post('/explore', async (req, res) => {
    const { name, icon, color, background_color, link, display_order } = req.body;
    if (!name)
        return res.status(400).json({ error: 'name es requerido' });
    try {
        const item = await prisma_1.default.exploreItem.create({
            data: { name, icon, color, background_color, link, display_order: display_order || 0, is_active: true },
        });
        return res.status(201).json(item);
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// PATCH /api/cms/explore/:id
router.patch('/explore/:id', async (req, res) => {
    try {
        const item = await prisma_1.default.exploreItem.update({ where: { id: req.params.id }, data: req.body });
        return res.json(item);
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// DELETE /api/cms/explore/:id
router.delete('/explore/:id', async (req, res) => {
    try {
        await prisma_1.default.exploreItem.delete({ where: { id: req.params.id } });
        return res.json({ message: 'Eliminado' });
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// ── Banners ────────────────────────────────────────────────
// GET /api/cms/banners — public, active + within date range
router.get('/banners', async (_req, res) => {
    try {
        const now = new Date();
        const banners = await prisma_1.default.banner.findMany({
            where: {
                is_active: true,
                OR: [
                    { start_date: null, end_date: null },
                    { start_date: { lte: now }, end_date: null },
                    { start_date: null, end_date: { gte: now } },
                    { start_date: { lte: now }, end_date: { gte: now } },
                ],
            },
            orderBy: { display_order: 'asc' },
        });
        return res.json(banners);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/cms/banners/all — admin
router.get('/banners/all', async (_req, res) => {
    try {
        const banners = await prisma_1.default.banner.findMany({ orderBy: { display_order: 'asc' } });
        return res.json(banners);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/cms/banners
router.post('/banners', async (req, res) => {
    const { title, subtitle, background_color, image_url, cta_text, cta_link, placement, start_date, end_date, display_order } = req.body;
    if (!title)
        return res.status(400).json({ error: 'title es requerido' });
    try {
        const banner = await prisma_1.default.banner.create({
            data: {
                title, subtitle, background_color, image_url, cta_text, cta_link,
                placement: placement || 'home_top',
                start_date: start_date ? new Date(start_date) : null,
                end_date: end_date ? new Date(end_date) : null,
                display_order: display_order || 0,
                is_active: true,
            },
        });
        return res.status(201).json(banner);
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// PATCH /api/cms/banners/:id
router.patch('/banners/:id', async (req, res) => {
    try {
        const data = { ...req.body };
        if (data.start_date)
            data.start_date = new Date(data.start_date);
        if (data.end_date)
            data.end_date = new Date(data.end_date);
        const banner = await prisma_1.default.banner.update({ where: { id: req.params.id }, data });
        return res.json(banner);
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// DELETE /api/cms/banners/:id
router.delete('/banners/:id', async (req, res) => {
    try {
        await prisma_1.default.banner.delete({ where: { id: req.params.id } });
        return res.json({ message: 'Eliminado' });
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
exports.default = router;
