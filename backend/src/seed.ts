import { PrismaClient, UserRole, UserStatus, OrganizationStatus, CatalogScope, ProductStatus, TrackingMode, LocationType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial warehouse database records...');

  const defaultPasswordHash = await bcrypt.hash('Password123!', 10);

  // 1. Create Central Warehouse
  const warehouse = await prisma.warehouse.upsert({
    where: { name: 'Central Warehouse Hub' },
    update: {},
    create: {
      name: 'Central Warehouse Hub',
      locationDescription: 'Main Distribution Center (loc-wh-1)',
      status: OrganizationStatus.ACTIVE,
    },
  });

  // Ensure warehouse stock location exists
  const warehouseLocation = await prisma.stockLocation.upsert({
    where: { warehouseId: warehouse.id },
    update: {},
    create: {
      warehouseId: warehouse.id,
      locationType: LocationType.WAREHOUSE,
    },
  });

  // 2. Create Client Organization
  const client = await prisma.client.upsert({
    where: { name: 'Apollo Diagnostics Lab' },
    update: {},
    create: {
      name: 'Apollo Diagnostics Lab',
      status: OrganizationStatus.ACTIVE,
    },
  });

  // Ensure client stock location exists
  const clientLocation = await prisma.stockLocation.upsert({
    where: { clientId: client.id },
    update: {},
    create: {
      clientId: client.id,
      locationType: LocationType.CLIENT,
    },
  });

  // Link Client and Warehouse
  await prisma.clientWarehouseAssignment.upsert({
    where: { id: `assign-${client.id}-${warehouse.id}` },
    update: {},
    create: {
      id: `assign-${client.id}-${warehouse.id}`,
      clientId: client.id,
      warehouseId: warehouse.id,
      isActive: true,
    },
  }).catch(() => {});

  // 3. Create Default Role Users
  // Super Admin
  await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: { passwordHash: defaultPasswordHash, status: UserStatus.ACTIVE },
    create: {
      username: 'superadmin',
      passwordHash: defaultPasswordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  // Store Admin
  await prisma.user.upsert({
    where: { username: 'storeadmin' },
    update: { passwordHash: defaultPasswordHash, status: UserStatus.ACTIVE, warehouseId: warehouse.id },
    create: {
      username: 'storeadmin',
      passwordHash: defaultPasswordHash,
      role: UserRole.STORE_ADMIN,
      status: UserStatus.ACTIVE,
      warehouseId: warehouse.id,
    },
  });

  // Client Admin
  await prisma.user.upsert({
    where: { username: 'clientadmin' },
    update: { passwordHash: defaultPasswordHash, status: UserStatus.ACTIVE, clientId: client.id },
    create: {
      username: 'clientadmin',
      passwordHash: defaultPasswordHash,
      role: UserRole.CLIENT_ADMIN,
      status: UserStatus.ACTIVE,
      clientId: client.id,
    },
  });

  // 4. Create Category
  let category = await prisma.category.findFirst({
    where: { name: 'Consumables & Reagents', ownerScope: CatalogScope.COMPANY },
  });
  if (!category) {
    category = await prisma.category.create({
      data: {
        name: 'Consumables & Reagents',
        ownerScope: CatalogScope.COMPANY,
      },
    });
  }

  // 5. Create Initial Products
  const cartridge = await prisma.product.upsert({
    where: { duplicateKey: 'prod-cartridge-a' },
    update: {},
    create: {
      name: 'Diagnostic Cartridge A',
      brand: 'Labco Precision',
      description: 'Standard clinical diagnostic cartridge for blood panel',
      duplicateKey: 'prod-cartridge-a',
      categoryId: category.id,
      ownerScope: CatalogScope.COMPANY,
      status: ProductStatus.APPROVED,
      trackingMode: TrackingMode.BATCH_ONLY,
      minQuantity: 20,
    },
  });

  const reagent = await prisma.product.upsert({
    where: { duplicateKey: 'prod-chem-reagent-500' },
    update: {},
    create: {
      name: 'Chemical Reagent 500ml',
      brand: 'Labco Bio',
      description: 'Assay buffer reagent solution 500ml',
      duplicateKey: 'prod-chem-reagent-500',
      categoryId: category.id,
      ownerScope: CatalogScope.COMPANY,
      status: ProductStatus.APPROVED,
      trackingMode: TrackingMode.BOTH,
      minQuantity: 10,
    },
  });

  // 6. Create Base Inventory Balances
  const balanceCartridge = await prisma.inventoryBalance.findFirst({
    where: { locationId: warehouseLocation.id, productId: cartridge.id },
  });
  if (!balanceCartridge) {
    await prisma.inventoryBalance.create({
      data: {
        locationId: warehouseLocation.id,
        productId: cartridge.id,
        usableQty: 150,
        reservedQty: 0,
      },
    });
  }

  const balanceReagent = await prisma.inventoryBalance.findFirst({
    where: { locationId: warehouseLocation.id, productId: reagent.id },
  });
  if (!balanceReagent) {
    await prisma.inventoryBalance.create({
      data: {
        locationId: warehouseLocation.id,
        productId: reagent.id,
        usableQty: 80,
        reservedQty: 0,
      },
    });
  }

  console.log('✓ Seeding complete!');
  console.log('--------------------------------------------------');
  console.log('Default Credentials:');
  console.log('1. Super Admin: username=superadmin, password=Password123!');
  console.log('2. Store Admin: username=storeadmin, password=Password123!');
  console.log('3. Client Admin: username=clientadmin, password=Password123!');
  console.log('--------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
