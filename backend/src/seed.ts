import {
  PrismaClient,
  UserRole,
  UserStatus,
  OrganizationStatus,
  CatalogScope,
  ProductStatus,
  ProductKind,
  TrackingMode,
  LocationType,
  RequestType,
  RequestStatus,
  RequestPriority,
  ReservationStatus,
  ShipmentType,
  ShipmentStatus,
  ProductVersionStatus,
  UnitStatus,
  BatchStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting comprehensive diagnostic warehouse database seeding...');
  const defaultPasswordHash = await bcrypt.hash('Password123!', 10);

  // =========================================================================
  // 1. WAREHOUSES & STOCK LOCATIONS (3 Stores / Hubs)
  // =========================================================================
  console.log('Seeding 3 warehouse distribution hubs...');
  const warehouseDefs = [
    {
      name: 'Central Warehouse Hub',
      desc: 'Main Logistics & Central Distribution Center (loc-wh-1)',
      adminUsername: 'storeadmin',
    },
    {
      name: 'Northern Regional Depot',
      desc: 'Regional Cold-Chain Depot North - Delhi NCR (loc-wh-2)',
      adminUsername: 'storeadmin_north',
    },
    {
      name: 'Southern Distribution Center',
      desc: 'Regional Fast-Dispatch Center South - Bengaluru (loc-wh-3)',
      adminUsername: 'storeadmin_south',
    },
  ];

  const warehouses: Record<string, { id: string; locationId: string; name: string }> = {};

  for (const whDef of warehouseDefs) {
    const wh = await prisma.warehouse.upsert({
      where: { name: whDef.name },
      update: { status: OrganizationStatus.ACTIVE, locationDescription: whDef.desc },
      create: {
        name: whDef.name,
        locationDescription: whDef.desc,
        status: OrganizationStatus.ACTIVE,
      },
    });

    const whLoc = await prisma.stockLocation.upsert({
      where: { warehouseId: wh.id },
      update: {},
      create: {
        warehouseId: wh.id,
        locationType: LocationType.WAREHOUSE,
      },
    });

    warehouses[whDef.name] = { id: wh.id, locationId: whLoc.id, name: wh.name };
  }

  // =========================================================================
  // 2. CLIENT ORGANIZATIONS & STOCK LOCATIONS (8 Clients)
  // =========================================================================
  console.log('Seeding 8 healthcare & pathology lab clients...');
  const clientDefs = [
    { name: 'Apollo Diagnostics Lab', username: 'clientadmin_apollo' },
    { name: 'Max Healthcare Pathology', username: 'clientadmin_max' },
    { name: 'Fortis Clinical Laboratories', username: 'clientadmin_fortis' },
    { name: 'Metropolis Diagnostics Center', username: 'clientadmin_metropolis' },
    { name: 'Dr. Lal PathLabs Network', username: 'clientadmin_lalpath' },
    { name: 'SRL Diagnostic Center', username: 'clientadmin_srl' },
    { name: 'Medanta Diagnostic Services', username: 'clientadmin_medanta' },
    { name: 'Care Diagnostics & Hospitals', username: 'clientadmin_care' },
  ];

  const clients: Record<string, { id: string; locationId: string; name: string; username: string }> = {};

  for (const cDef of clientDefs) {
    const c = await prisma.client.upsert({
      where: { name: cDef.name },
      update: { status: OrganizationStatus.ACTIVE },
      create: {
        name: cDef.name,
        status: OrganizationStatus.ACTIVE,
      },
    });

    const cLoc = await prisma.stockLocation.upsert({
      where: { clientId: c.id },
      update: {},
      create: {
        clientId: c.id,
        locationType: LocationType.CLIENT,
      },
    });

    clients[cDef.name] = { id: c.id, locationId: cLoc.id, name: c.name, username: cDef.username };

    // Link client to Central Warehouse + Regional Warehouse
    const assignedWh = [warehouses['Central Warehouse Hub'].id];
    if (cDef.name.includes('Delhi') || cDef.name.includes('Max') || cDef.name.includes('Fortis') || cDef.name.includes('Lal')) {
      assignedWh.push(warehouses['Northern Regional Depot'].id);
    } else {
      assignedWh.push(warehouses['Southern Distribution Center'].id);
    }

    for (const whId of assignedWh) {
      await prisma.clientWarehouseAssignment.upsert({
        where: { id: `assign-${c.id}-${whId}` },
        update: { isActive: true },
        create: {
          id: `assign-${c.id}-${whId}`,
          clientId: c.id,
          warehouseId: whId,
          isActive: true,
        },
      }).catch(() => {});
    }
  }

  // =========================================================================
  // 3. USERS (Super Admin, 3 Store Admins, 8 Client Admins + Alias)
  // =========================================================================
  console.log('Seeding enterprise user accounts...');
  // 3.1 Super Admin
  const superAdmin = await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: { passwordHash: defaultPasswordHash, status: UserStatus.ACTIVE },
    create: {
      username: 'superadmin',
      passwordHash: defaultPasswordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  // 3.2 Store Admins
  for (const whDef of warehouseDefs) {
    const wh = warehouses[whDef.name];
    await prisma.user.upsert({
      where: { username: whDef.adminUsername },
      update: {
        passwordHash: defaultPasswordHash,
        status: UserStatus.ACTIVE,
        warehouseId: wh.id,
        role: UserRole.STORE_ADMIN,
      },
      create: {
        username: whDef.adminUsername,
        passwordHash: defaultPasswordHash,
        role: UserRole.STORE_ADMIN,
        status: UserStatus.ACTIVE,
        warehouseId: wh.id,
      },
    });
  }

  // 3.3 Client Admins
  const clientAdminUsers: Record<string, { id: string; username: string }> = {};

  for (const cDef of clientDefs) {
    const c = clients[cDef.name];
    const user = await prisma.user.upsert({
      where: { username: cDef.username },
      update: {
        passwordHash: defaultPasswordHash,
        status: UserStatus.ACTIVE,
        clientId: c.id,
        role: UserRole.CLIENT_ADMIN,
      },
      create: {
        username: cDef.username,
        passwordHash: defaultPasswordHash,
        role: UserRole.CLIENT_ADMIN,
        status: UserStatus.ACTIVE,
        clientId: c.id,
      },
    });
    clientAdminUsers[cDef.username] = { id: user.id, username: user.username };
  }

  // Ensure default demo user 'clientadmin' aliases to Apollo Diagnostics
  const apollo = clients['Apollo Diagnostics Lab'];
  await prisma.user.upsert({
    where: { username: 'clientadmin' },
    update: {
      passwordHash: defaultPasswordHash,
      status: UserStatus.ACTIVE,
      clientId: apollo.id,
      role: UserRole.CLIENT_ADMIN,
    },
    create: {
      username: 'clientadmin',
      passwordHash: defaultPasswordHash,
      role: UserRole.CLIENT_ADMIN,
      status: UserStatus.ACTIVE,
      clientId: apollo.id,
    },
  });

  // =========================================================================
  // 4. CATEGORIES (5 Categories)
  // =========================================================================
  console.log('Seeding 5 master catalog categories...');
  const categoryNames = [
    'Clinical Chemistry & Reagents',
    'Hematology & Coagulation',
    'Molecular Diagnostics & PCR',
    'Immunology & Serology Kits',
    'General Lab Consumables & Plasticware',
  ];

  const categories: Record<string, { id: string; name: string }> = {};

  for (const catName of categoryNames) {
    let cat = await prisma.category.findFirst({
      where: { name: catName, ownerScope: CatalogScope.COMPANY },
    });
    if (!cat) {
      cat = await prisma.category.create({
        data: {
          name: catName,
          ownerScope: CatalogScope.COMPANY,
        },
      });
    }
    categories[catName] = { id: cat.id, name: cat.name };
  }

  // Brands list
  const brands = [
    'Labco Precision',
    'Labco BioAssay',
    'Roche Diagnostics Partner',
    'Abbott Diagnostics Partner',
    'Beckman Coulter Equivalent',
    'Siemens Healthineers Line',
  ];

  // Helper to create product, unit, and batch
  async function seedProduct(def: {
    name: string;
    brand: string;
    category: string;
    kind: ProductKind;
    unit: string;
    desc: string;
    minQty: number;
    batchNumber: string;
    trackingMode?: TrackingMode;
  }) {
    const slug = def.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const dupKey = `prod-${slug}`;
    const category = categories[def.category];

    const product = await prisma.product.upsert({
      where: { duplicateKey: dupKey },
      update: {
        name: def.name,
        brand: def.brand,
        description: def.desc,
        categoryId: category.id,
        kind: def.kind,
        status: ProductStatus.APPROVED,
        trackingMode: def.trackingMode || TrackingMode.BATCH_ONLY,
        minQuantity: def.minQty,
        ownerScope: CatalogScope.COMPANY,
      },
      create: {
        name: def.name,
        brand: def.brand,
        description: def.desc,
        duplicateKey: dupKey,
        categoryId: category.id,
        kind: def.kind,
        status: ProductStatus.APPROVED,
        trackingMode: def.trackingMode || TrackingMode.BATCH_ONLY,
        minQuantity: def.minQty,
        ownerScope: CatalogScope.COMPANY,
      },
    });

    // Base Unit
    let unit = await prisma.productUnit.findFirst({
      where: { productId: product.id, isBaseUnit: true },
    });
    if (!unit) {
      unit = await prisma.productUnit.create({
        data: {
          productId: product.id,
          unitName: def.unit,
          isBaseUnit: true,
          conversionToBase: 1,
          status: UnitStatus.ACTIVE,
        },
      });
    }

    // Default Batch with future expiry
    let batch = await prisma.stockBatch.findFirst({
      where: { productId: product.id, batchNumber: def.batchNumber },
    });
    if (!batch) {
      batch = await prisma.stockBatch.create({
        data: {
          productId: product.id,
          batchNumber: def.batchNumber,
          expiryDate: new Date('2028-06-30T00:00:00.000Z'),
          status: BatchStatus.ACTIVE,
        },
      });
    }

    // If MANUFACTURED_PRODUCT, ensure ProductVersion exists
    if (def.kind === ProductKind.MANUFACTURED_PRODUCT) {
      await prisma.productVersion.upsert({
        where: {
          productId_versionNumber: {
            productId: product.id,
            versionNumber: 1,
          },
        },
        update: {},
        create: {
          productId: product.id,
          versionNumber: 1,
          status: ProductVersionStatus.APPROVED,
          submittedById: superAdmin.id,
          reviewedById: superAdmin.id,
          reviewedAt: new Date(),
          specification: {
            tolerance: '±0.5%',
            storageTemp: '2°C to 8°C',
            qualityControlStandard: 'ISO 13485:2016 Compliant',
          },
          changeReason: 'Initial baseline production release specification',
        },
      });
    }

    return { product, unit, batch };
  }

  // =========================================================================
  // 5. 45 RAW / PROCURED PRODUCTS (Raw Materials & Lab Consumables)
  // =========================================================================
  console.log('Seeding 45 raw materials and consumable diagnostic products...');
  const rawProductDefs = [
    // Clinical Chemistry & Reagents (10 items)
    { name: 'Glucose Hexokinase Reagent R1/R2', brand: 'Labco Precision', category: 'Clinical Chemistry & Reagents', unit: 'Kit', desc: 'Quantitative in vitro determination of glucose in human serum', minQty: 25, batchNumber: 'LOT-GLU-2026A' },
    { name: 'Creatinine Enzymatic Assay Kit', brand: 'Labco BioAssay', category: 'Clinical Chemistry & Reagents', unit: 'Kit', desc: 'Liquid-stable enzymatic reagent for creatinine clearance testing', minQty: 20, batchNumber: 'LOT-CREAT-2026B' },
    { name: 'Urea Nitrogen (BUN) UV Reagent', brand: 'Roche Diagnostics Partner', category: 'Clinical Chemistry & Reagents', unit: 'Kit', desc: 'Kinetic UV test for serum and plasma urea measurement', minQty: 20, batchNumber: 'LOT-BUN-2026A' },
    { name: 'ALT / SGPT Liquid Reagent 4x100ml', brand: 'Beckman Coulter Equivalent', category: 'Clinical Chemistry & Reagents', unit: 'Pack', desc: 'Alanine Aminotransferase measurement reagent formulation', minQty: 30, batchNumber: 'LOT-ALT-2026C' },
    { name: 'AST / SGOT Liquid Reagent 4x100ml', brand: 'Beckman Coulter Equivalent', category: 'Clinical Chemistry & Reagents', unit: 'Pack', desc: 'Aspartate Aminotransferase diagnostic enzymatic solution', minQty: 30, batchNumber: 'LOT-AST-2026C' },
    { name: 'Total Cholesterol CHOD-PAP Reagent', brand: 'Labco Precision', category: 'Clinical Chemistry & Reagents', unit: 'Kit', desc: 'Enzymatic colorimetric method for total cholesterol quantification', minQty: 25, batchNumber: 'LOT-CHOL-2026D' },
    { name: 'Triglycerides GPO-PAP Reagent Solution', brand: 'Labco Precision', category: 'Clinical Chemistry & Reagents', unit: 'Kit', desc: 'Colorimetric enzymatic reagent for triglycerides profile', minQty: 20, batchNumber: 'LOT-TRIG-2026A' },
    { name: 'Alkaline Phosphatase (ALP) DEA Buffer', brand: 'Siemens Healthineers Line', category: 'Clinical Chemistry & Reagents', unit: 'Kit', desc: 'Kinetic photometric assay with diethanolamine buffer', minQty: 15, batchNumber: 'LOT-ALP-2026B' },
    { name: 'Total Bilirubin DMSO Reagent Kit', brand: 'Abbott Diagnostics Partner', category: 'Clinical Chemistry & Reagents', unit: 'Kit', desc: 'Direct and total bilirubin photometric analysis reagent', minQty: 15, batchNumber: 'LOT-BILI-2026A' },
    { name: 'ISE Electrolyte Reference Solution 1L', brand: 'Labco BioAssay', category: 'Clinical Chemistry & Reagents', unit: 'Bottle', desc: 'Calibrated reference electrolyte solution for Na+/K+/Cl- electrodes', minQty: 40, batchNumber: 'LOT-ISE-2026E' },

    // Hematology & Coagulation (9 items)
    { name: 'Hematology Diluent Solution 20L', brand: 'Labco BioAssay', category: 'Hematology & Coagulation', unit: 'Canister', desc: 'Isotonic diluent buffer for automated blood cell counter', minQty: 50, batchNumber: 'LOT-DIL-2026A' },
    { name: 'Cyanide-Free Lyse Reagent 5L', brand: 'Labco Precision', category: 'Hematology & Coagulation', unit: 'Canister', desc: 'Environmentally safe RBC lytic reagent for hemoglobin determination', minQty: 35, batchNumber: 'LOT-LYS-2026B' },
    { name: 'Enzymatic Probe Cleaner 1L', brand: 'Labco BioAssay', category: 'Hematology & Coagulation', unit: 'Bottle', desc: 'Proteolytic cleaning solution for analyzer fluidic line flushing', minQty: 30, batchNumber: 'LOT-CLN-2026C' },
    { name: 'Prothrombin Time (PT) Rabbit Brain Reagent', brand: 'Roche Diagnostics Partner', category: 'Hematology & Coagulation', unit: 'Kit', desc: 'Lyophilized thromboplastin reagent with calcium for INR assays', minQty: 25, batchNumber: 'LOT-PT-2026A' },
    { name: 'Activated Partial Thromboplastin Time (aPTT)', brand: 'Roche Diagnostics Partner', category: 'Hematology & Coagulation', unit: 'Kit', desc: 'Ellagic acid activator reagent for coagulation pathway analysis', minQty: 25, batchNumber: 'LOT-APTT-2026A' },
    { name: 'Fibrinogen Clauss Quantitative Reagent', brand: 'Siemens Healthineers Line', category: 'Hematology & Coagulation', unit: 'Kit', desc: 'Bovine thrombin reagent for fibrinogen determination in plasma', minQty: 15, batchNumber: 'LOT-FIB-2026B' },
    { name: 'D-Dimer Latex Immunoturbidimetric Reagent', brand: 'Abbott Diagnostics Partner', category: 'Hematology & Coagulation', unit: 'Kit', desc: 'Quantitative latex agglutination reagent for thrombosis screening', minQty: 20, batchNumber: 'LOT-DDIM-2026A' },
    { name: 'Hematology Tri-Level Control Blood 3x3ml', brand: 'Labco Precision', category: 'Hematology & Coagulation', unit: 'Pack', desc: 'Low, normal, and high hematology reference controls', minQty: 15, batchNumber: 'LOT-HCTL-2026D' },
    { name: 'Coagulation Normal Control Plasma 10x1ml', brand: 'Siemens Healthineers Line', category: 'Hematology & Coagulation', unit: 'Box', desc: 'Standard human plasma pool for PT and aPTT precision verification', minQty: 15, batchNumber: 'LOT-CCTL-2026A' },

    // Molecular Diagnostics & PCR (9 items)
    { name: 'Taq DNA Polymerase Master Mix 2X (5ml)', brand: 'Labco BioAssay', category: 'Molecular Diagnostics & PCR', unit: 'Vial', desc: 'High-fidelity hot-start PCR master mix with dNTPs and MgCl2', minQty: 30, batchNumber: 'LOT-TAQ-2026A' },
    { name: 'Magnetic Bead Viral RNA/DNA Extraction Kit', brand: 'Labco BioAssay', category: 'Molecular Diagnostics & PCR', unit: 'Kit', desc: 'Superparamagnetic nanoparticle-based high-purity nucleic acid isolation', minQty: 40, batchNumber: 'LOT-MAG-2026B' },
    { name: 'Proteinase K Solution (20mg/ml, 10ml)', brand: 'Labco Precision', category: 'Molecular Diagnostics & PCR', unit: 'Vial', desc: 'Broad-spectrum serine protease for nucleic acid sample prep', minQty: 25, batchNumber: 'LOT-PROTK-2026A' },
    { name: 'Nuclease-Free Molecular Grade Water 500ml', brand: 'Labco Precision', category: 'Molecular Diagnostics & PCR', unit: 'Bottle', desc: 'DEPC-treated, sterile deionized water verified free of DNase/RNase', minQty: 60, batchNumber: 'LOT-NFW-2026C' },
    { name: 'One-Step RT-qPCR Probe Buffer 4X', brand: 'Roche Diagnostics Partner', category: 'Molecular Diagnostics & PCR', unit: 'Vial', desc: 'Fluorogenic probe-based reverse transcription PCR reagent blend', minQty: 20, batchNumber: 'LOT-RTQ-2026A' },
    { name: 'PCR Clean-Up Spin Column Cartridge Pack', brand: 'Beckman Coulter Equivalent', category: 'Molecular Diagnostics & PCR', unit: 'Box', desc: 'Silica membrane spin columns for PCR product purification (250 tests)', minQty: 20, batchNumber: 'LOT-SPIN-2026B' },
    { name: 'SYBR Green qPCR Master Formulation 5ml', brand: 'Abbott Diagnostics Partner', category: 'Molecular Diagnostics & PCR', unit: 'Vial', desc: 'Intercalating dye master mix for quantitative gene expression', minQty: 15, batchNumber: 'LOT-SYBR-2026A' },
    { name: 'Agarose Multi-Purpose Molecular Grade 500g', brand: 'Labco Precision', category: 'Molecular Diagnostics & PCR', unit: 'Bottle', desc: 'Low EEO agarose for high-resolution analytical electrophoresis gels', minQty: 20, batchNumber: 'LOT-AGAR-2026D' },
    { name: '100bp DNA Ladder Molecular Marker 500ul', brand: 'Labco BioAssay', category: 'Molecular Diagnostics & PCR', unit: 'Vial', desc: 'Pre-stained molecular weight marker ranging from 100bp to 1500bp', minQty: 15, batchNumber: 'LOT-LAD-2026A' },

    // Immunology & Serology Kits (8 items)
    { name: 'High-Sensitivity CRP Latex Reagent 100T', brand: 'Labco Precision', category: 'Immunology & Serology Kits', unit: 'Kit', desc: 'Immunoturbidimetric assay for C-Reactive Protein inflammatory detection', minQty: 30, batchNumber: 'LOT-CRP-2026A' },
    { name: 'Troponin-I Rapid Quantitative Test Cartridges', brand: 'Roche Diagnostics Partner', category: 'Immunology & Serology Kits', unit: 'Box', desc: 'Fluorescence immunoassay test cartridges for acute cardiac assessment', minQty: 40, batchNumber: 'LOT-TROP-2026B' },
    { name: 'HbA1c Direct Enzymatic Lyophilized Reagent', brand: 'Abbott Diagnostics Partner', category: 'Immunology & Serology Kits', unit: 'Kit', desc: 'Direct enzymatic glycated hemoglobin determination without sample pre-treatment', minQty: 25, batchNumber: 'LOT-HBA-2026A' },
    { name: 'Ferritin Chemiluminescence Reagent Kit', brand: 'Beckman Coulter Equivalent', category: 'Immunology & Serology Kits', unit: 'Kit', desc: 'Paramagnetic microparticle assay for iron storage quantification', minQty: 20, batchNumber: 'LOT-FER-2026C' },
    { name: 'Thyroid Stimulating Hormone (TSH) CLIA Kit', brand: 'Siemens Healthineers Line', category: 'Immunology & Serology Kits', unit: 'Kit', desc: 'Ultra-sensitive 3rd generation TSH chemiluminescent assay', minQty: 25, batchNumber: 'LOT-TSH-2026A' },
    { name: 'Dengue NS1 Antigen Rapid Screen Cassettes', brand: 'Labco BioAssay', category: 'Immunology & Serology Kits', unit: 'Box', desc: 'Immunochromatographic test cassettes for early dengue fever detection (50T)', minQty: 50, batchNumber: 'LOT-DENG-2026D' },
    { name: 'HBsAg Surface Antigen ELISA Microplate Kit', brand: 'Labco Precision', category: 'Immunology & Serology Kits', unit: 'Kit', desc: 'Enzyme immunoassay for qualitative detection of Hepatitis B virus antigen', minQty: 20, batchNumber: 'LOT-HBS-2026A' },
    { name: 'Procalcitonin (PCT) Immunoassay Cartridge', brand: 'Roche Diagnostics Partner', category: 'Immunology & Serology Kits', unit: 'Box', desc: 'Biomarker cartridge for systemic bacterial infection and sepsis stratification', minQty: 20, batchNumber: 'LOT-PCT-2026B' },

    // General Lab Consumables & Plasticware (9 items)
    { name: 'K2-EDTA Blood Collection Tubes 4ml (100s)', brand: 'Labco Precision', category: 'General Lab Consumables & Plasticware', unit: 'Box', desc: 'Vacuum blood collection tubes with dipotassium EDTA anticoagulant', minQty: 100, batchNumber: 'LOT-EDTA-2026A' },
    { name: 'Serum Clot Activator Tubes 5ml (100s)', brand: 'Labco Precision', category: 'General Lab Consumables & Plasticware', unit: 'Box', desc: 'Silica-coated evacuated tubes with gel separator for clinical chemistry', minQty: 100, batchNumber: 'LOT-CLOT-2026B' },
    { name: 'Sodium Citrate 3.2% Coagulation Tubes 2ml', brand: 'Labco Precision', category: 'General Lab Consumables & Plasticware', unit: 'Box', desc: 'Precise 9:1 blood-to-anticoagulant ratio tubes for coagulation profiles', minQty: 80, batchNumber: 'LOT-CITR-2026A' },
    { name: 'Filtered Pipette Tips 200ul Racked (960s)', brand: 'Labco BioAssay', category: 'General Lab Consumables & Plasticware', unit: 'Case', desc: 'Aerosol barrier filter tips, RNase/DNase and endotoxin free (10 racks)', minQty: 40, batchNumber: 'LOT-TIP-2026C' },
    { name: 'Filtered Pipette Tips 1000ul Racked (960s)', brand: 'Labco BioAssay', category: 'General Lab Consumables & Plasticware', unit: 'Case', desc: 'Extended length barrier tips for contamination-free sample handling', minQty: 35, batchNumber: 'LOT-TIP1K-2026A' },
    { name: 'Microcentrifuge Tubes 1.5ml RNase-Free (500s)', brand: 'Labco Precision', category: 'General Lab Consumables & Plasticware', unit: 'Pack', desc: 'Boil-proof polypropylene centrifuge tubes with frosted writing surface', minQty: 50, batchNumber: 'LOT-MCT-2026D' },
    { name: 'Nitrile Examination Gloves Powder-Free (Medium)', brand: 'Labco Precision', category: 'General Lab Consumables & Plasticware', unit: 'Box', desc: 'Medical grade ambidextrous nitrile gloves (Box of 100, Medium)', minQty: 120, batchNumber: 'LOT-GLV-2026M' },
    { name: 'Conical Centrifuge Tubes 50ml Sterile (25s)', brand: 'Labco BioAssay', category: 'General Lab Consumables & Plasticware', unit: 'Pack', desc: 'Gamma-irradiated sterile polypropylene screw-cap graduated centrifuge tubes', minQty: 60, batchNumber: 'LOT-CNT-2026A' },
    { name: 'Optical Grade Reaction Cuvettes (1000s)', brand: 'Beckman Coulter Equivalent', category: 'General Lab Consumables & Plasticware', unit: 'Case', desc: 'Disposable precision polymethyl methacrylate cuvettes for spectrophotometers', minQty: 30, batchNumber: 'LOT-CUV-2026B' },
  ];

  const rawProducts: Record<string, { product: any; unit: any; batch: any }> = {};

  for (const def of rawProductDefs) {
    const res = await seedProduct({
      ...def,
      kind: ProductKind.RAW_MATERIAL,
    });
    rawProducts[def.name] = res;
  }

  // =========================================================================
  // 6. 20 MANUFACTURED PRODUCTS (In-House Labco Formulations & Packs)
  // =========================================================================
  console.log('Seeding 20 manufactured diagnostic assay kits and assemblies...');
  const mfgProductDefs = [
    { name: 'Labco Multi-Analyte Chemistry Analyzer Kit 500T', brand: 'Labco Precision', category: 'Clinical Chemistry & Reagents', unit: 'Kit', desc: 'Integrated multi-parameter clinical chemistry formulation pack', minQty: 15, batchNumber: 'LOT-MFG-CHEM-01' },
    { name: 'Labco Complete Blood Count (CBC) Pack 3-Diff', brand: 'Labco BioAssay', category: 'Hematology & Coagulation', unit: 'Kit', desc: 'Calibrated diluent, lyse, and rinse reagent assembly for 3-part diff', minQty: 20, batchNumber: 'LOT-MFG-CBC-02' },
    { name: 'Labco Comprehensive Metabolic Panel Kit (CMP-14)', brand: 'Labco Precision', category: 'Clinical Chemistry & Reagents', unit: 'Kit', desc: 'Pre-measured 14-parameter clinical chemistry metabolic panel', minQty: 15, batchNumber: 'LOT-MFG-CMP-03' },
    { name: 'Labco Cardiac Biomarker Tri-Pack (Trop-I / CK-MB / Myo)', brand: 'Labco Precision', category: 'Immunology & Serology Kits', unit: 'Kit', desc: 'Emergency department triage cardiac panel diagnostic cassette pack', minQty: 25, batchNumber: 'LOT-MFG-CARD-04' },
    { name: 'Labco Coagulation Profiler Assay Duo (PT / aPTT)', brand: 'Labco BioAssay', category: 'Hematology & Coagulation', unit: 'Kit', desc: 'Paired screening reagents for extrinsic and intrinsic clotting paths', minQty: 20, batchNumber: 'LOT-MFG-COAG-05' },
    { name: 'Labco COVID/Flu Multiplex RT-PCR Diagnostic Kit', brand: 'Labco BioAssay', category: 'Molecular Diagnostics & PCR', unit: 'Kit', desc: '4-target real-time RT-PCR diagnostic kit for SARS-CoV-2 and Influenza A/B', minQty: 30, batchNumber: 'LOT-MFG-PCR-06' },
    { name: 'Labco High-Sensitivity CRP Automated Assay Pack', brand: 'Labco Precision', category: 'Immunology & Serology Kits', unit: 'Kit', desc: 'Ready-to-use liquid-stable hs-CRP reagent cartridge for auto-analyzers', minQty: 20, batchNumber: 'LOT-MFG-CRP-07' },
    { name: 'Labco Renal Function Assay Assembly (Urea / Creat / eGFR)', brand: 'Labco Precision', category: 'Clinical Chemistry & Reagents', unit: 'Kit', desc: 'Kidney profile diagnostic reagent pack with automated eGFR reporting', minQty: 15, batchNumber: 'LOT-MFG-REN-08' },
    { name: 'Labco Electrolyte 4-Parameter Calibrated Pack', brand: 'Labco BioAssay', category: 'Clinical Chemistry & Reagents', unit: 'Pack', desc: 'Formulated Na/K/Cl/iCa liquid calibrators and reference solutions', minQty: 25, batchNumber: 'LOT-MFG-ELE-09' },
    { name: 'Labco Glycated Hemoglobin (HbA1c) Column Assembly', brand: 'Labco Precision', category: 'Immunology & Serology Kits', unit: 'Kit', desc: 'NGSP and IFCC certified ion-exchange microcolumn pack for diabetic monitoring', minQty: 15, batchNumber: 'LOT-MFG-HBA-10' },
    { name: 'Labco Thyroid Panel Reagent Set (T3 / T4 / TSH)', brand: 'Labco Precision', category: 'Immunology & Serology Kits', unit: 'Kit', desc: 'Chemiluminescent endocrine diagnostic reagent assembly', minQty: 20, batchNumber: 'LOT-MFG-THY-11' },
    { name: 'Labco Autoimmune Screen IFA Multi-Well Slides', brand: 'Labco BioAssay', category: 'Immunology & Serology Kits', unit: 'Kit', desc: 'HEp-2 substrate immunofluorescence slides with conjugate buffer', minQty: 10, batchNumber: 'LOT-MFG-AUTO-12' },
    { name: 'Labco Clinical Chemistry Calibration Multipack', brand: 'Labco Precision', category: 'Clinical Chemistry & Reagents', unit: 'Pack', desc: 'Multi-constituent lyophilized human serum calibrators (Level 1 & Level 2)', minQty: 20, batchNumber: 'LOT-MFG-CAL-13' },
    { name: 'Labco Routine Urinalysis Test Strips 10-Parameter 100s', brand: 'Labco Precision', category: 'General Lab Consumables & Plasticware', unit: 'Bottle', desc: 'Colorimetric dry reagent test strips for urine chemistry analyzer', minQty: 40, batchNumber: 'LOT-MFG-URN-14' },
    { name: 'Labco Ferritin & Anemia Screening Kit', brand: 'Labco BioAssay', category: 'Immunology & Serology Kits', unit: 'Kit', desc: 'Enhanced microparticle immunoassay for serum ferritin assessment', minQty: 15, batchNumber: 'LOT-MFG-FER-15' },
    { name: 'Labco Infectious Mononucleosis Rapid Diagnostic Unit', brand: 'Labco Precision', category: 'Immunology & Serology Kits', unit: 'Box', desc: 'Direct heterophile antibody lateral flow test units (25 tests)', minQty: 20, batchNumber: 'LOT-MFG-MONO-16' },
    { name: 'Labco Direct Antiglobulin Test (DAT) Reagent Assembly', brand: 'Labco BioAssay', category: 'Hematology & Coagulation', unit: 'Kit', desc: 'Polyspecific Coombs reagent assembly for hemolytic anemia screening', minQty: 15, batchNumber: 'LOT-MFG-DAT-17' },
    { name: 'Labco Blood Gas & pH Sensor Module Replacement Pack', brand: 'Labco Precision', category: 'General Lab Consumables & Plasticware', unit: 'Pack', desc: 'Precision cartridge-integrated sensor module for critical care analyzers', minQty: 10, batchNumber: 'LOT-MFG-BGAS-18' },
    { name: 'Labco Vitamin D (25-OH) Quantitative Chemiluminescent Kit', brand: 'Labco Precision', category: 'Immunology & Serology Kits', unit: 'Kit', desc: 'Direct competitive chemiluminescence assay for 25-hydroxyvitamin D', minQty: 20, batchNumber: 'LOT-MFG-VITD-19' },
    { name: 'Labco Total Protein & Albumin Dual Assay Formulation', brand: 'Labco BioAssay', category: 'Clinical Chemistry & Reagents', unit: 'Kit', desc: 'Biuret method total protein and BCG albumin reagent duo', minQty: 25, batchNumber: 'LOT-MFG-PROT-20' },
  ];

  const mfgProducts: Record<string, { product: any; unit: any; batch: any }> = {};

  for (const def of mfgProductDefs) {
    const res = await seedProduct({
      ...def,
      kind: ProductKind.MANUFACTURED_PRODUCT,
    });
    mfgProducts[def.name] = res;
  }

  const allProductList = [...Object.values(rawProducts), ...Object.values(mfgProducts)];

  // =========================================================================
  // 7. INVENTORY BALANCES (Warehouses & Client Locations)
  // =========================================================================
  console.log('Seeding warehouse stock balances and client on-hand inventories...');
  // Helper to upsert balance
  async function setBalance(locId: string, prodId: string, batchId: string, usable: number, reserved: number = 0) {
    const existing = await prisma.inventoryBalance.findFirst({
      where: { locationId: locId, productId: prodId, batchId: batchId },
    });
    if (existing) {
      await prisma.inventoryBalance.update({
        where: { id: existing.id },
        data: { usableQty: usable, reservedQty: reserved },
      });
    } else {
      await prisma.inventoryBalance.create({
        data: {
          locationId: locId,
          productId: prodId,
          batchId: batchId,
          usableQty: usable,
          reservedQty: reserved,
        },
      });
    }
  }

  // 7.1 Central Warehouse Hub (High stock across all items)
  const centralWhLoc = warehouses['Central Warehouse Hub'].locationId;
  for (const item of allProductList) {
    await setBalance(centralWhLoc, item.product.id, item.batch.id, 450, 0);
  }

  // 7.2 Northern & Southern Regional Depots (Selected stock)
  const northWhLoc = warehouses['Northern Regional Depot'].locationId;
  const southWhLoc = warehouses['Southern Distribution Center'].locationId;

  for (let i = 0; i < allProductList.length; i++) {
    const item = allProductList[i];
    if (i % 2 === 0) {
      await setBalance(northWhLoc, item.product.id, item.batch.id, 200, 0);
    }
    if (i % 2 === 1) {
      await setBalance(southWhLoc, item.product.id, item.batch.id, 180, 0);
    }
  }

  // 7.3 Client Facilities (On-hand stock for everyday diagnostic tests)
  const clientList = Object.values(clients);

  for (let cIdx = 0; cIdx < clientList.length; cIdx++) {
    const c = clientList[cIdx];
    // Give each client 12-15 distinct products with realistic usable quantity
    for (let pIdx = 0; pIdx < 14; pIdx++) {
      const itemIdx = (cIdx * 4 + pIdx) % allProductList.length;
      const item = allProductList[itemIdx];
      const usableQty = 30 + ((cIdx + pIdx) * 5) % 45;
      await setBalance(c.locationId, item.product.id, item.batch.id, usableQty, 0);
    }
  }

  // =========================================================================
  // 8. STOCK REQUESTS & IN-TRANSIT SHIPMENTS FOR CLIENTS
  // =========================================================================
  console.log('Seeding stock requests and in-transit delivery shipments...');

  for (let i = 0; i < clientList.length; i++) {
    const c = clientList[i];
    const clientUser = clientAdminUsers[c.username] || { id: superAdmin.id };
    const sourceWh = i % 2 === 0 ? warehouses['Central Warehouse Hub'] : warehouses['Northern Regional Depot'];

    // Pick 3 products for testing transactions
    const p1 = allProductList[(i * 3) % allProductList.length];
    const p2 = allProductList[(i * 3 + 1) % allProductList.length];
    const p3 = allProductList[(i * 3 + 2) % allProductList.length];

    // 8.1 Active IN_TRANSIT Shipment for clients (clients 0 to 5)
    if (i < 6) {
      const reqId = `seed-req-transit-${c.id.substring(0, 8)}`;
      const shipId = `seed-ship-transit-${c.id.substring(0, 8)}`;

      // Create Request in APPROVED status
      await prisma.stockRequest.upsert({
        where: { id: reqId },
        update: {},
        create: {
          id: reqId,
          requestType: RequestType.DISPATCH,
          status: RequestStatus.APPROVED,
          priority: RequestPriority.NORMAL,
          requesterId: clientUser.id,
          sourceLocationId: sourceWh.locationId,
          destinationLocationId: c.locationId,
          clientId: c.id,
          reason: `Scheduled diagnostic reagents replenishment for ${c.name}`,
          submittedAt: new Date(Date.now() - 24 * 3600 * 1000),
          lines: {
            create: [
              {
                productId: p1.product.id,
                batchId: p1.batch.id,
                batchNumber: p1.batch.batchNumber,
                quantity: 20,
                unitId: p1.unit.id,
                unitNameSnapshot: p1.unit.unitName,
                conversionToBaseSnapshot: 1,
                baseQuantity: 20,
              },
              {
                productId: p2.product.id,
                batchId: p2.batch.id,
                batchNumber: p2.batch.batchNumber,
                quantity: 15,
                unitId: p2.unit.id,
                unitNameSnapshot: p2.unit.unitName,
                conversionToBaseSnapshot: 1,
                baseQuantity: 15,
              },
            ],
          },
        },
      });

      // Create In-Transit Shipment
      await prisma.shipment.upsert({
        where: { requestId: reqId },
        update: {},
        create: {
          id: shipId,
          requestId: reqId,
          shipmentType: ShipmentType.DISPATCH_TO_CLIENT,
          sourceLocationId: sourceWh.locationId,
          destinationLocationId: c.locationId,
          status: ShipmentStatus.IN_TRANSIT,
          notes: `Cold-chain dispatch via Labco Express Courier #LABCO-${1000 + i}. Temp monitored: 4.2°C`,
          dispatchedAt: new Date(Date.now() - 12 * 3600 * 1000),
          lines: {
            create: [
              {
                productId: p1.product.id,
                batchId: p1.batch.id,
                unitName: p1.unit.unitName,
                dispatchedQty: 20,
              },
              {
                productId: p2.product.id,
                batchId: p2.batch.id,
                unitName: p2.unit.unitName,
                dispatchedQty: 15,
              },
            ],
          },
        },
      });
    }

    // 8.2 Past COMPLETED Delivered Shipment (clients 6 and 7)
    if (i >= 6) {
      const pastReqId = `seed-req-past-${c.id.substring(0, 8)}`;
      const pastShipId = `seed-ship-past-${c.id.substring(0, 8)}`;

      await prisma.stockRequest.upsert({
        where: { id: pastReqId },
        update: {},
        create: {
          id: pastReqId,
          requestType: RequestType.DISPATCH,
          status: RequestStatus.APPROVED,
          priority: RequestPriority.NORMAL,
          requesterId: clientUser.id,
          sourceLocationId: sourceWh.locationId,
          destinationLocationId: c.locationId,
          clientId: c.id,
          reason: `Routine quarterly consumables delivery`,
          submittedAt: new Date(Date.now() - 7 * 24 * 3600 * 1000),
          lines: {
            create: [
              {
                productId: p1.product.id,
                batchId: p1.batch.id,
                batchNumber: p1.batch.batchNumber,
                quantity: 40,
                unitId: p1.unit.id,
                unitNameSnapshot: p1.unit.unitName,
                conversionToBaseSnapshot: 1,
                baseQuantity: 40,
              },
            ],
          },
        },
      });

      await prisma.shipment.upsert({
        where: { requestId: pastReqId },
        update: {},
        create: {
          id: pastShipId,
          requestId: pastReqId,
          shipmentType: ShipmentType.DISPATCH_TO_CLIENT,
          sourceLocationId: sourceWh.locationId,
          destinationLocationId: c.locationId,
          status: ShipmentStatus.COMPLETED,
          notes: `Verified receipt with electronic delivery challan signed by facility supervisor.`,
          dispatchedAt: new Date(Date.now() - 7 * 24 * 3600 * 1000),
          receivedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
          lines: {
            create: [
              {
                productId: p1.product.id,
                batchId: p1.batch.id,
                unitName: p1.unit.unitName,
                dispatchedQty: 40,
                receivedQty: 40,
                discrepancyQty: 0,
              },
            ],
          },
        },
      });
    }

    // 8.3 Pending Approval Stock Request (for clients 0, 1, 2, 3) to test Super Admin Approvals
    if (i < 4) {
      const pendingReqId = `seed-req-pending-${c.id.substring(0, 8)}`;
      const reqLineId = `line-pending-${c.id.substring(0, 8)}`;

      // Update warehouse balance to reflect reserved quantity for non-negative available stock
      const pQty = 12;
      const whBal = await prisma.inventoryBalance.findFirst({
        where: { locationId: sourceWh.locationId, productId: p3.product.id, batchId: p3.batch.id },
      });
      if (whBal) {
        await prisma.inventoryBalance.update({
          where: { id: whBal.id },
          data: { reservedQty: Number(whBal.reservedQty) + pQty },
        });
      }

      await prisma.stockRequest.upsert({
        where: { id: pendingReqId },
        update: {},
        create: {
          id: pendingReqId,
          requestType: RequestType.STOCK_OUT,
          status: RequestStatus.PENDING_APPROVAL,
          priority: i === 0 ? RequestPriority.URGENT : RequestPriority.HIGH,
          requesterId: clientUser.id,
          sourceLocationId: sourceWh.locationId,
          destinationLocationId: c.locationId,
          clientId: c.id,
          reason: `Urgent restocking required for high volume testing: ${p3.product.name}`,
          submittedAt: new Date(Date.now() - 3600 * 1000 * (i + 1)),
          lines: {
            create: [
              {
                id: reqLineId,
                productId: p3.product.id,
                batchId: p3.batch.id,
                batchNumber: p3.batch.batchNumber,
                quantity: pQty,
                unitId: p3.unit.id,
                unitNameSnapshot: p3.unit.unitName,
                conversionToBaseSnapshot: 1,
                baseQuantity: pQty,
                reservations: {
                  create: [
                    {
                      locationId: sourceWh.locationId,
                      productId: p3.product.id,
                      batchId: p3.batch.id,
                      quantityBase: pQty,
                      status: ReservationStatus.ACTIVE,
                    },
                  ],
                },
              },
            ],
          },
        },
      });
    }

    // 8.4 Draft Requests for client self-service testing (clients 4, 5)
    if (i === 4 || i === 5) {
      const draftReqId = `seed-req-draft-${c.id.substring(0, 8)}`;
      await prisma.stockRequest.upsert({
        where: { id: draftReqId },
        update: {},
        create: {
          id: draftReqId,
          requestType: RequestType.STOCK_OUT,
          status: RequestStatus.DRAFT,
          priority: RequestPriority.NORMAL,
          requesterId: clientUser.id,
          sourceLocationId: sourceWh.locationId,
          destinationLocationId: c.locationId,
          clientId: c.id,
          reason: `Draft requisition awaiting clinical team review`,
          lines: {
            create: [
              {
                productId: p2.product.id,
                batchId: p2.batch.id,
                batchNumber: p2.batch.batchNumber,
                quantity: 10,
                unitId: p2.unit.id,
                unitNameSnapshot: p2.unit.unitName,
                conversionToBaseSnapshot: 1,
                baseQuantity: 10,
              },
            ],
          },
        },
      });
    }
  }

  console.log('\n==================================================');
  console.log('✓ Comprehensive Seed Finished Successfully!');
  console.log('==================================================');
  console.log('Summary of Seeded Data:');
  console.log('  • 3 Warehouses (Central Hub, Northern Regional, Southern Distribution)');
  console.log('  • 8 Healthcare Client Organizations with Stock Locations & Warehouse Assignments');
  console.log('  • 5 Master Categories & 6 Accredited Brands');
  console.log('  • 45 Raw Materials / Diagnostic Consumables (Approved, Batch-Tracked)');
  console.log('  • 20 Manufactured Diagnostic Assay Formulations (Approved with ProductVersion)');
  console.log('  • Warehouse Stock Balances & Client On-Hand Inventories');
  console.log('  • 6 Active IN_TRANSIT Shipments with Delivery Notes & Lines');
  console.log('  • 2 Delivered/Completed Past Shipments');
  console.log('  • 4 Pending Stock Requests in Approvals Queue with Active Held Reservations');
  console.log('  • 2 Draft Requests for Client Testing');
  // =========================================================================
  // 12. CLIENT STAFF & WORK LOGS (Mini HR Portal)
  // =========================================================================
  console.log('Seeding client staff members and sample daily work logs...');
  const apolloClient = clients['Apollo Diagnostics Lab'];
  if (apolloClient) {
    const staffMembers = [
      {
        staffNumber: 'EMP-001',
        fullName: 'Dr. Aris Vance',
        roleTitle: 'Senior Lab Director & Assay Lead',
        contact: '+91 98765 43210',
      },
      {
        staffNumber: 'EMP-002',
        fullName: 'Priya Sharma',
        roleTitle: 'Quality Assurance Specialist',
        contact: '+91 98765 43211',
      },
      {
        staffNumber: 'EMP-003',
        fullName: 'Rahul Verma',
        roleTitle: 'Diagnostic Kit Assembler',
        contact: '+91 98765 43212',
      },
    ];

    for (const sm of staffMembers) {
      const createdStaff = await prisma.clientStaffMember.upsert({
        where: {
          clientId_staffNumber: {
            clientId: apolloClient.id,
            staffNumber: sm.staffNumber,
          },
        },
        update: {
          fullName: sm.fullName,
          roleTitle: sm.roleTitle,
          contact: sm.contact,
        },
        create: {
          clientId: apolloClient.id,
          staffNumber: sm.staffNumber,
          fullName: sm.fullName,
          roleTitle: sm.roleTitle,
          contact: sm.contact,
        },
      });

      const existingLogs = await prisma.clientStaffWorkLog.findFirst({
        where: { staffMemberId: createdStaff.id },
      });
      if (!existingLogs) {
        await prisma.clientStaffWorkLog.create({
          data: {
            clientId: apolloClient.id,
            staffMemberId: createdStaff.id,
            logDate: new Date(),
            shiftType: 'MORNING',
            hoursWorked: new Decimal(8),
            tasksCompleted: 'Completed diagnostic assay batch calibration and supervised line assembly for COVID-19 Ag Rapid Test kits.',
            notes: 'Zero defects reported on morning run.',
          },
        });
      }
    }
  }

  console.log('--------------------------------------------------');
  console.log('Default Credentials (Password for all accounts: Password123!):');
  console.log('  1. Super Admin: username=superadmin');
  console.log('  2. Store Admins:');
  console.log('     • storeadmin (Central Warehouse Hub)');
  console.log('     • storeadmin_north (Northern Regional Depot)');
  console.log('     • storeadmin_south (Southern Distribution Center)');
  console.log('  3. Client Admins:');
  console.log('     • clientadmin (Apollo Diagnostics Lab default demo)');
  console.log('     • clientadmin_apollo (Apollo Diagnostics Lab)');
  console.log('     • clientadmin_max (Max Healthcare Pathology)');
  console.log('     • clientadmin_fortis (Fortis Clinical Laboratories)');
  console.log('     • clientadmin_metropolis (Metropolis Diagnostics Center)');
  console.log('     • clientadmin_lalpath (Dr. Lal PathLabs Network)');
  console.log('     • clientadmin_srl (SRL Diagnostic Center)');
  console.log('     • clientadmin_medanta (Medanta Diagnostic Services)');
  console.log('     • clientadmin_care (Care Diagnostics & Hospitals)');
  console.log('==================================================\n');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
