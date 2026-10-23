import {
  PrismaClient,
  UserRole,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function bootstrapSuperAdmin() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Initial administrator provisioning is only enabled in production.');
  }

  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!username || !/^[a-z0-9_.-]{3,64}$/.test(username)) {
    throw new Error('BOOTSTRAP_ADMIN_USERNAME must be 3–64 lowercase letters, numbers, dots, underscores, or hyphens.');
  }
  if (!password || password.length < 12) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (transaction) => {
    // Serialize concurrent bootstrap attempts before checking whether any account exists.
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(1952937812, 1902520211)`;
    if (await transaction.user.count() !== 0) {
      throw new Error('Administrator bootstrap refused: this database already contains user accounts.');
    }

    await transaction.user.create({
      data: {
        username,
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
  });

  console.log('Initial Super Admin account created. Remove BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD from the deployment environment now.');
}

bootstrapSuperAdmin()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Administrator bootstrap failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    delete process.env.BOOTSTRAP_ADMIN_USERNAME;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    await prisma.$disconnect();
  });
