const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const prisma = new PrismaClient();

async function testBooking() {
  try {
    const p = await prisma.memberProfile.findFirst({ where: { first_name: 'Max' } });
    if (!p) throw new Error("No Max");

    const authRes = await axios.post('http://localhost:3000/api/auth/login', { member_number: '31505', profile_id: p.id, pin_code: '' });
    const token = authRes.data.token;
    console.log('Got token');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const payload1 = {
      resource_id: 'cancha_padel_atala_1', date: dateStr, start_time: '12:00', end_time: '13:00'
    };
    const payload2 = {
      resource_id: 'cancha_padel_atala_2', date: dateStr, start_time: '14:00', end_time: '15:00'
    };

    console.log('Booking 1: expected to succeed (or hit normal limit)');
    try {
      const res1 = await axios.post('http://localhost:3000/api/reservations/book', payload1, { headers: { Authorization: `Bearer ${token}` } });
      console.log('Result 1:', res1.data.message);
    } catch (e) { console.error('Error 1:', e.response?.data?.error || e.message); }

    console.log('\nBooking 2: expected to fail because already have 1 padel booked in seed + 1 padel just booked = 2 max per week');
    try {
      const res2 = await axios.post('http://localhost:3000/api/reservations/book', payload2, { headers: { Authorization: `Bearer ${token}` } });
      console.log('Result 2:', res2.data);
    } catch (e) { console.error('Error 2:', e.response?.data?.error || e.message); }

  } catch(e) { console.log(e.response?.data?.error || e.message); }
  finally { await prisma.$disconnect(); }
}
testBooking();
