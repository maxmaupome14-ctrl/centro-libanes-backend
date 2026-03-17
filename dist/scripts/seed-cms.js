"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = __importDefault(require("../lib/prisma"));
async function seedCMS() {
    // Seed Featured Items
    const featuredCount = await prisma_1.default.featuredItem.count();
    if (featuredCount === 0) {
        await prisma_1.default.featuredItem.createMany({
            data: [
                { title: 'Natación Libre', subtitle: 'Piscina Olímpica', gradient_start: '#005A36', gradient_end: '#007A4A', icon: 'waves', link: '/reservations', display_order: 0 },
                { title: 'Clínica de Tenis', subtitle: 'Canchas 1-4', gradient_start: '#1a3a5c', gradient_end: '#2d5a8a', icon: 'trophy', link: '/reservations', display_order: 1 },
                { title: 'Yoga Restaurativo', subtitle: 'L-M-V 7:00 am', gradient_start: '#6B4226', gradient_end: '#A0522D', icon: 'heart', link: '/reservations', display_order: 2 },
                { title: 'Spinning', subtitle: 'Salon Fitness', gradient_start: '#7A0A2E', gradient_end: '#A01040', icon: 'zap', link: '/reservations', display_order: 3 },
                { title: 'Clase de Box', subtitle: 'Ring Principal', gradient_start: '#1A1A2E', gradient_end: '#16213E', icon: 'dumbbell', link: '/reservations', display_order: 4 },
            ],
        });
        console.log('✓ Seeded 5 featured items');
    }
    // Seed Explore Items
    const exploreCount = await prisma_1.default.exploreItem.count();
    if (exploreCount === 0) {
        await prisma_1.default.exploreItem.createMany({
            data: [
                { name: 'Deportes', icon: 'dumbbell', color: '#007A4A', background_color: 'rgba(0,122,74,0.08)', link: '/reservations', display_order: 0 },
                { name: 'Spa & Barbería', icon: 'sparkles', color: '#C9A84C', background_color: 'rgba(201,168,76,0.08)', link: '/reservations', display_order: 1 },
                { name: 'Acuáticas', icon: 'waves', color: '#06B6D4', background_color: 'rgba(6,182,212,0.08)', link: '/reservations', display_order: 2 },
                { name: 'Danza', icon: 'music', color: '#8B5CF6', background_color: 'rgba(139,92,246,0.08)', link: '/reservations', display_order: 3 },
                { name: 'Invitar amigos', icon: 'user-plus', color: '#059669', background_color: 'rgba(5,150,105,0.08)', link: '/guests', display_order: 4 },
                { name: 'Mis pagos', icon: 'heart', color: '#EF4444', background_color: 'rgba(239,68,68,0.08)', link: '/payment', display_order: 5 },
            ],
        });
        console.log('✓ Seeded 6 explore items');
    }
    // Seed Banners
    const bannerCount = await prisma_1.default.banner.count();
    if (bannerCount === 0) {
        await prisma_1.default.banner.createMany({
            data: [
                { title: 'Torneo de Verano 2026', subtitle: 'Inscripciones abiertas para tenis, pádel y natación', background_color: '#007A4A', cta_text: 'Ver torneos', cta_link: '/tournaments', placement: 'home_top', display_order: 0 },
            ],
        });
        console.log('✓ Seeded 1 banner');
    }
    console.log('CMS seed complete');
    await prisma_1.default.$disconnect();
}
seedCMS().catch(console.error);
