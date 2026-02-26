import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    try {
        const member_number = 31505;
        const membership = await prisma.membership.findUnique({
            where: { member_number: parseInt(member_number as any) },
            include: {
                profiles: {
                    where: { is_active: true }
                }
            }
        });
        console.log(membership);
    } catch (e) {
        console.error("ERROR CAUGHT", e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
