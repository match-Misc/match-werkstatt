const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.document.deleteMany();
  await prisma.order.deleteMany();
  console.log('Alle Aufträge und zugehörige Dokumente wurden gelöscht!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
