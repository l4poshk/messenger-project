const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Migrating data...');

  // 1. Update all OWNER members to CREATOR
  const updatedMembers = await prisma.member.updateMany({
    where: { role: 'OWNER' },
    data: { role: 'CREATOR' }
  });
  console.log(`Updated ${updatedMembers.count} members to CREATOR role.`);

  // 2. Set creatorId for chats based on the CREATOR member
  const chats = await prisma.chat.findMany({
    include: { members: true }
  });

  for (const chat of chats) {
    const creator = chat.members.find(m => m.role === 'CREATOR');
    if (creator) {
      await prisma.chat.update({
        where: { id: chat.id },
        data: { creatorId: creator.userId }
      });
      console.log(`Set creatorId for chat ${chat.id} to ${creator.userId}`);
    }
  }

  console.log('Migration complete.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
