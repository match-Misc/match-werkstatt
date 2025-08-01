const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Admin-Account
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: 'admin123',
      name: 'Administrator',
      role: 'admin',
      isActive: true,
      isApproved: true,
    },
  });
  // Werkstatt-Account
  await prisma.user.upsert({
    where: { username: 'werkstatt' },
    update: {},
    create: {
      username: 'werkstatt',
      password: 'werkstatt123',
      name: 'Werkstatt',
      role: 'workshop',
      isActive: true,
      isApproved: true,
    },
  });
  console.log('Admin- und Werkstatt-Account wurden angelegt!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
