import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding enterprise database with Super Admin...');

  const defaultPasswordHash = await bcrypt.hash('Password123!', 10);

  // Ensure default superadmin exists and is active
  const superAdmin = await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: {
      passwordHash: defaultPasswordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      warehouseId: null,
      projectId: null,
    },
    create: {
      username: 'superadmin',
      passwordHash: defaultPasswordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  console.log('✓ Super Admin account is ready:');
  console.log('  Username: superadmin');
  console.log('  Role:     SUPER_ADMIN');
  console.log('  Status:   ACTIVE');
  console.log('  Password: Password123!');
  console.log('--------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('Database seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
