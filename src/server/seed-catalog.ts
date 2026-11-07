import { PrismaClient, CatalogScope, ProductStatus, UnitStatus, ProductKind, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

interface SeedItem {
  category: string;
  subCategory: string;
  name: string;
  brand?: string;
  unit: string;
}

const RAW_DATA: SeedItem[] = [
  // 1. Sponge -> Abd Sponge
  { category: 'Sponge', subCategory: 'Abd Sponge', name: '30x30x 12 (T-17)', unit: 'Piece' },
  { category: 'Sponge', subCategory: 'Abd Sponge', name: '30x30x 8  (T-17)', unit: 'Piece' },
  { category: 'Sponge', subCategory: 'Abd Sponge', name: '30x30x 12 (T-13)', unit: 'Piece' },
  { category: 'Sponge', subCategory: 'Abd Sponge', name: '30x30x 8 (T-13)', unit: 'Piece' },
  { category: 'Sponge', subCategory: 'Abd Sponge', name: '25x25x 12 (T-17)', unit: 'Piece' },
  { category: 'Sponge', subCategory: 'Abd Sponge', name: '25x25x 8 (T-17)', unit: 'Piece' },
  { category: 'Sponge', subCategory: 'Abd Sponge', name: '25x25x 12 (T-13)', unit: 'Piece' },
  { category: 'Sponge', subCategory: 'Abd Sponge', name: '25x25x 8 (T-13)', unit: 'Piece' },

  // 2. Flat Reel -> Konkore
  { category: 'Flat Reel', subCategory: 'Konkore', name: '50x200 (Konkore)', brand: 'Konkore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Konkore', name: '75x200 (Konkore)', brand: 'Konkore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Konkore', name: '100x200 (Konkore)', brand: 'Konkore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Konkore', name: '150x200 (Konkore)', brand: 'Konkore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Konkore', name: '200x200 (Konkore)', brand: 'Konkore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Konkore', name: '250x200 (Konkore)', brand: 'Konkore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Konkore', name: '300x200 (Konkore)', brand: 'Konkore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Konkore', name: '350x200 (Konkore)', brand: 'Konkore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Konkore', name: '400x200 (Konkore)', brand: 'Konkore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Konkore', name: '450x200 (Konkore)', brand: 'Konkore', unit: 'Roll' },

  // 2. Flat Reel -> Strikore
  { category: 'Flat Reel', subCategory: 'Strikore', name: '50x200 (Strikore)', brand: 'Strikore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Strikore', name: '75x200 (Strikore)', brand: 'Strikore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Strikore', name: '100x200 (Strikore)', brand: 'Strikore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Strikore', name: '150x200 (Strikore)', brand: 'Strikore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Strikore', name: '200x200 (Strikore)', brand: 'Strikore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Strikore', name: '250x200 (Strikore)', brand: 'Strikore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Strikore', name: '300x200 (Strikore)', brand: 'Strikore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Strikore', name: '350x200 (Strikore)', brand: 'Strikore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Strikore', name: '400x200 (Strikore)', brand: 'Strikore', unit: 'Roll' },
  { category: 'Flat Reel', subCategory: 'Strikore', name: '450x200 (Strikore)', brand: 'Strikore', unit: 'Roll' },

  // 3. Wrapping Sheets -> SMS Paper (60 GSM)
  { category: 'Wrapping Sheets', subCategory: 'SMS Paper (60 GSM)', name: 'SMS Paper (60 GSM) 75 x 75 mm', unit: 'Sheet' },
  { category: 'Wrapping Sheets', subCategory: 'SMS Paper (60 GSM)', name: 'SMS Paper (60 GSM) 90 x 90 mm', unit: 'Sheet' },
  { category: 'Wrapping Sheets', subCategory: 'SMS Paper (60 GSM)', name: 'SMS Paper (60 GSM) 100 x 100 mm', unit: 'Sheet' },
  { category: 'Wrapping Sheets', subCategory: 'SMS Paper (60 GSM)', name: 'SMS Paper (60 GSM) 120 x 120 mm', unit: 'Sheet' },

  // 3. Wrapping Sheets -> SMS Paper (43 GSM)
  { category: 'Wrapping Sheets', subCategory: 'SMS Paper (43 GSM)', name: 'SMS Paper (43 GSM) 75 x 75 mm', unit: 'Sheet' },
  { category: 'Wrapping Sheets', subCategory: 'SMS Paper (43 GSM)', name: 'SMS Paper (43 GSM) 90 x 90 mm', unit: 'Sheet' },
  { category: 'Wrapping Sheets', subCategory: 'SMS Paper (43 GSM)', name: 'SMS Paper (43 GSM) 100 x 100 mm', unit: 'Sheet' },
  { category: 'Wrapping Sheets', subCategory: 'SMS Paper (43 GSM)', name: 'SMS Paper (43 GSM) 120 x 120 mm', unit: 'Sheet' },

  // 3. Wrapping Sheets -> Crepe Paper (60 GSM)
  { category: 'Wrapping Sheets', subCategory: 'Crepe Paper (60 GSM)', name: 'Crepe Paper (60 GSM) 75 x 75 mm', unit: 'Sheet' },
  { category: 'Wrapping Sheets', subCategory: 'Crepe Paper (60 GSM)', name: 'Crepe Paper (60 GSM) 90 x 90 mm', unit: 'Sheet' },
  { category: 'Wrapping Sheets', subCategory: 'Crepe Paper (60 GSM)', name: 'Crepe Paper (60 GSM) 100 x 100 mm', unit: 'Sheet' },
  { category: 'Wrapping Sheets', subCategory: 'Crepe Paper (60 GSM)', name: 'Crepe Paper (60 GSM) 120 x 120 mm', unit: 'Sheet' },

  // 3. Wrapping Sheets -> Crepe Paper (43 GSM)
  { category: 'Wrapping Sheets', subCategory: 'Crepe Paper (43 GSM)', name: 'Crepe Paper (43 GSM) 75 x 75 mm', unit: 'Sheet' },
  { category: 'Wrapping Sheets', subCategory: 'Crepe Paper (43 GSM)', name: 'Crepe Paper (43 GSM) 90 x 90 mm', unit: 'Sheet' },
  { category: 'Wrapping Sheets', subCategory: 'Crepe Paper (43 GSM)', name: 'Crepe Paper (43 GSM) 100 x 100 mm', unit: 'Sheet' },
  { category: 'Wrapping Sheets', subCategory: 'Crepe Paper (43 GSM)', name: 'Crepe Paper (43 GSM) 120 x 120 mm', unit: 'Sheet' },

  // 4. Plasma Reels -> Tyvek Reel
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel', name: 'Tyvek Reel 50mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel', name: 'Tyvek Reel 75mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel', name: 'Tyvek Reel 100mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel', name: 'Tyvek Reel 125mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel', name: 'Tyvek Reel 150mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel', name: 'Tyvek Reel 200mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel', name: 'Tyvek Reel 250mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel', name: 'Tyvek Reel 300mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel', name: 'Tyvek Reel 350mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel', name: 'Tyvek Reel 400mm', unit: 'Roll' },

  // 4. Plasma Reels -> Tyvek Reel (KON)
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel (KON)', name: 'Tyvek Reel (kon) 50mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel (KON)', name: 'Tyvek Reel (kon) 75mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel (KON)', name: 'Tyvek Reel (kon) 100mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel (KON)', name: 'Tyvek Reel (kon) 125mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel (KON)', name: 'Tyvek Reel (kon) 150mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel (KON)', name: 'Tyvek Reel (kon) 200mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel (KON)', name: 'Tyvek Reel (kon) 250mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel (KON)', name: 'Tyvek Reel (kon) 300mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel (KON)', name: 'Tyvek Reel (kon) 350mm', unit: 'Roll' },
  { category: 'Plasma Reels', subCategory: 'Tyvek Reel (KON)', name: 'Tyvek Reel (kon) 400mm', unit: 'Roll' },

  // 5. Dressing Materials -> Gamjee Roll
  { category: 'Dressing Materials', subCategory: 'Gamjee Roll', name: 'Gamjee Roll', unit: 'Roll' },

  // 5. Dressing Materials -> Cotton
  { category: 'Dressing Materials', subCategory: 'Cotton', name: 'Cotton Roll 500gm', unit: 'Roll' },

  // 5. Dressing Materials -> Bandage
  { category: 'Dressing Materials', subCategory: 'Bandage', name: 'Bandage Roll 3" (Normal)', unit: 'Roll' },
  { category: 'Dressing Materials', subCategory: 'Bandage', name: 'Bandage Roll 4" (Normal)', unit: 'Roll' },
  { category: 'Dressing Materials', subCategory: 'Bandage', name: 'Bandage Roll 6" (Normal)', unit: 'Roll' },
  { category: 'Dressing Materials', subCategory: 'Bandage', name: 'Bandage Roll 3" (Fine Quality)', unit: 'Roll' },
  { category: 'Dressing Materials', subCategory: 'Bandage', name: 'Bandage Roll 4" (Fine Quality)', unit: 'Roll' },
  { category: 'Dressing Materials', subCategory: 'Bandage', name: 'Bandage Roll 6" (Fine Quality)', unit: 'Roll' },

  // 5. Dressing Materials -> Gauze Than
  { category: 'Dressing Materials', subCategory: 'Gauze Than', name: 'Gauze Than (100cm x 20mtr.)', unit: 'Than' },
  { category: 'Dressing Materials', subCategory: 'Gauze Than', name: 'Gauze Than (100cm x 18mtr.)', unit: 'Than' },
  { category: 'Dressing Materials', subCategory: 'Gauze Than', name: 'Gauze Than (38TPI) (100cm x 20mtr.)', unit: 'Than' },
  { category: 'Dressing Materials', subCategory: 'Gauze Than', name: 'Gauze Than (46TPI) (100cm x 20mtr.)', unit: 'Than' },

  // 5. Dressing Materials -> Gauze Swab (T-17)
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (T-17)', name: 'Gauze Swab 7.5x7.5x 12 Ply (T-17)', unit: 'Piece' },
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (T-17)', name: 'Gauze Swab 7.5x7.5x 8 Ply (T-17)', unit: 'Piece' },
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (T-17)', name: 'Gauze swab 10x10x 12 Ply (T-17)', unit: 'Piece' },
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (T-17)', name: 'Gauze swab 10x10x 8 Ply (T-17)', unit: 'Piece' },
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (T-17)', name: '(X-Ray) Gauze swab 10x10x 12 Ply (T-17)', unit: 'Piece' },

  // 5. Dressing Materials -> Gauze Swab (T-13)
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (T-13)', name: 'Gauze Swab 7.5x7.5x 12 Ply (T-13)', unit: 'Piece' },
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (T-13)', name: 'Gauze Swab 7.5x7.5x 8 Ply (T-13)', unit: 'Piece' },
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (T-13)', name: 'Gauze swab 10x10x 12 Ply (T-13)', unit: 'Piece' },
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (T-13)', name: 'Gauze swab 10x10x 8 Ply (T-13)', unit: 'Piece' },
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (T-13)', name: '(X-Ray) Gauze swab 10x10x 12 Ply (T-13)', unit: 'Piece' },

  // 5. Dressing Materials -> Gauze Swab (Pack of 5) (T-17)
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (Pack of 5) (T-17)', name: 'Gauze Swab 7.5x7.5x 12 Ply (T-17) (Pouch)', unit: 'Pouch' },
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (Pack of 5) (T-17)', name: 'Gauze Swab 7.5x7.5x 8 Ply (T-17) (Pouch)', unit: 'Pouch' },
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (Pack of 5) (T-17)', name: 'Gauze Swab 10x10x 12 Ply (T-17) (Pouch)', unit: 'Pouch' },
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (Pack of 5) (T-17)', name: 'Gauze Swab 10x10x 8 Ply (T-17) (Pouch)', unit: 'Pouch' },
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (Pack of 5) (T-17)', name: '(X-Ray) Gauze Swab 10x10x 12 Ply (T-17) (Pouch)', unit: 'Pouch' },

  // 5. Dressing Materials -> Gauze Swab (Pack of 5) (T-13)
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (Pack of 5) (T-13)', name: 'Gauze Swab 7.5x7.5x 12 Ply (T-13) (Pouch)', unit: 'Pouch' },
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (Pack of 5) (T-13)', name: 'Gauze Swab 7.5x7.5x 8 Ply (T-13) (Pouch)', unit: 'Pouch' },
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (Pack of 5) (T-13)', name: 'Gauze Swab 10x10x 12 Ply (T-13) (Pouch)', unit: 'Pouch' },
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (Pack of 5) (T-13)', name: 'Gauze Swab 10x10x 8 Ply (T-13) (Pouch)', unit: 'Pouch' },
  { category: 'Dressing Materials', subCategory: 'Gauze Swab (Pack of 5) (T-13)', name: '(X-Ray) Gauze Swab 10x10x 12 Ply (T-13) (Pouch)', unit: 'Pouch' },

  // 6. Documentation Label Roll
  { category: 'Documentation Label Roll', subCategory: 'Documentation Label Roll (Steam)', name: 'Documentation Label Roll (Steam) (Konkore)', brand: 'Konkore', unit: 'Roll' },
  { category: 'Documentation Label Roll', subCategory: 'Documentation Label Roll (ETO)', name: 'Documentation Label Roll (ETO) (Konkore)', brand: 'Konkore', unit: 'Roll' },
  { category: 'Documentation Label Roll', subCategory: 'Documentation Label Roll (Plasma)', name: 'Documentation Label Roll (Plasma) (Konkore)', brand: 'Konkore', unit: 'Roll' },
  { category: 'Documentation Label Roll', subCategory: 'Documentation Label Roll (Unbranded)', name: 'Documentation Label Roll (Steam) (Printex)', brand: 'Printex', unit: 'Roll' },

  // 7. Chemicals -> Neodisher
  { category: 'Chemicals', subCategory: 'Neodisher', name: 'Neodisher - N', brand: 'Neodisher', unit: 'Bottle' },
  { category: 'Chemicals', subCategory: 'Neodisher', name: 'Neodisher - FA', brand: 'Neodisher', unit: 'Bottle' },
  { category: 'Chemicals', subCategory: 'Neodisher', name: 'Neodisher - LM2', brand: 'Neodisher', unit: 'Bottle' },
  { category: 'Chemicals', subCategory: 'Neodisher', name: 'Neodisher - IR', brand: 'Neodisher', unit: 'Bottle' },
  { category: 'Chemicals', subCategory: 'Neodisher', name: 'Neodisher - IP', brand: 'Neodisher', unit: 'Bottle' },
  { category: 'Chemicals', subCategory: 'Neodisher', name: 'Neodisher - Medicleane Fort- 5 Ltr.', brand: 'Neodisher', unit: 'Can' },

  // 7. Chemicals -> Other subcategories
  { category: 'Chemicals', subCategory: 'Cleaning & Sanitization', name: 'Hand wash', unit: 'Bottle' },
  { category: 'Chemicals', subCategory: 'Cleaning & Sanitization', name: 'Sanitizer', unit: 'Bottle' },
  { category: 'Chemicals', subCategory: 'Disinfectant', name: 'Fumigation Disinfectant', unit: 'Bottle' },
  { category: 'Chemicals', subCategory: 'Cleaner', name: 'Clean -G Cleaner (Miracle)', brand: 'Miracle', unit: 'Bottle' },
  { category: 'Chemicals', subCategory: 'Lubricant', name: 'Instrument Lubricant (Miracle)', brand: 'Miracle', unit: 'Bottle' },
  { category: 'Chemicals', subCategory: 'Rust & Stain Remover', name: 'Rust & Stain Remover', unit: 'Bottle' },
  { category: 'Chemicals', subCategory: 'Solution', name: 'Hydrogen Peroxide & Silver Solution (Miracle)', brand: 'Miracle', unit: 'Bottle' },
  { category: 'Chemicals', subCategory: 'Detrolube', name: 'Detrolube Spray', unit: 'Can' },

  // 8. Indicators -> Biological Indicator
  { category: 'Indicators', subCategory: 'Biological Indicator', name: 'Biological Indicator Steam - (BT-20)', unit: 'Box' },
  { category: 'Indicators', subCategory: 'Biological Indicator', name: 'Biological Indicator Steam - (BT-224) (20 Mints)', unit: 'Box' },
  { category: 'Indicators', subCategory: 'Biological Indicator', name: 'Biological Indicator Steam - (BT-220) (03 hr.)', unit: 'Box' },
  { category: 'Indicators', subCategory: 'Biological Indicator', name: 'Biological Indicator Plasma (BT-96)', unit: 'Box' },
  { category: 'Indicators', subCategory: 'Biological Indicator', name: 'Biological Indicator Plasma (BT-98) (30 mints)', unit: 'Box' },
  { category: 'Indicators', subCategory: 'Biological Indicator', name: 'Biological Indicator ETO (BT-10)', unit: 'Box' },

  // 8. Indicators -> Chemical Indicator
  { category: 'Indicators', subCategory: 'Chemical Indicator', name: 'Chemical Indicator Steam class-5 (konkore)', brand: 'Konkore', unit: 'Box' },
  { category: 'Indicators', subCategory: 'Chemical Indicator', name: 'Chemical Indicator Steam class-6 (konkore)', brand: 'Konkore', unit: 'Box' },
  { category: 'Indicators', subCategory: 'Chemical Indicator', name: 'Chemical Indicator ETO class -5 (konkore)', brand: 'Konkore', unit: 'Box' },
  { category: 'Indicators', subCategory: 'Chemical Indicator', name: 'Chemical Indicator Strips Plasma Class-4 (konkore)', brand: 'Konkore', unit: 'Box' },
  { category: 'Indicators', subCategory: 'Chemical Indicator', name: 'Chemical Indicator Steam class -5 (Biosteri)', brand: 'Biosteri', unit: 'Box' },
  { category: 'Indicators', subCategory: 'Chemical Indicator', name: 'Chemical Indicator ETO (IT-12) (Tarragene)', brand: 'Tarragene', unit: 'Box' },
  { category: 'Indicators', subCategory: 'Chemical Indicator', name: 'Chemical Indicator Plasma (UB36-CD40) (Tarragene)', brand: 'Tarragene', unit: 'Box' },
  { category: 'Indicators', subCategory: 'Chemical Indicator', name: 'Chemical Indicator Steam (UB26-IT26C) (Tarragene)', brand: 'Tarragene', unit: 'Box' },
  { category: 'Indicators', subCategory: 'Chemical Indicator', name: 'Chemical Indicator Steam (IT-26-1YS) (Tarragene)', brand: 'Tarragene', unit: 'Box' },
  { category: 'Indicators', subCategory: 'Chemical Indicator', name: 'Chemical Indicator Washer Disinfector (UB34-CDWA4) (Tarragene)', brand: 'Tarragene', unit: 'Box' },

  // 9. Bowie Dick
  { category: 'Bowie Dick', subCategory: 'Bowie Dick', name: 'Bowie Dick Test Pack', unit: 'Pack' },
  { category: 'Bowie Dick', subCategory: 'Bowie Dick', name: 'Bowie Dick A4 Size', unit: 'Pack' },

  // 10. Sterilization -> Sterilization Tape
  { category: 'Sterilization', subCategory: 'Sterilization Tape', name: 'Sterilization Tape Steam', unit: 'Roll' },
  { category: 'Sterilization', subCategory: 'Sterilization Tape', name: 'Sterilization Tape Plasma', unit: 'Roll' },
  { category: 'Sterilization', subCategory: 'Sterilization Tape', name: 'Sterilization Tape ETO', unit: 'Roll' },

  // 10. Sterilization -> Sterilization Gusseted Reel
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Reel', name: 'Gusseted Reel 50 mm', unit: 'Roll' },
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Reel', name: 'Gusseted Reel 75 mm', unit: 'Roll' },
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Reel', name: 'Gusseted Reel 100 mm', unit: 'Roll' },
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Reel', name: 'Gusseted Reel 150 mm', unit: 'Roll' },
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Reel', name: 'Gusseted Reel 200 mm', unit: 'Roll' },
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Reel', name: 'Gusseted Reel 250 mm', unit: 'Roll' },
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Reel', name: 'Gusseted Reel 300 mm', unit: 'Roll' },
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Reel', name: 'Gusseted Reel 350 mm', unit: 'Roll' },
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Reel', name: 'Gusseted Reel 400 mm', unit: 'Roll' },

  // 10. Sterilization -> Sterilization Gusseted Flat Pouch
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Flat Pouch', name: 'Gusseted Flat Pouch 150 x 300 mm', unit: 'Pouch' },
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Flat Pouch', name: 'Gusseted Flat Pouch 150 x 400 mm', unit: 'Pouch' },
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Flat Pouch', name: 'Gusseted Flat Pouch 200 x 250 mm', unit: 'Pouch' },
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Flat Pouch', name: 'Gusseted Flat Pouch 200 x 300 mm', unit: 'Pouch' },
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Flat Pouch', name: 'Gusseted Flat Pouch 200 x 350 mm', unit: 'Pouch' },
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Flat Pouch', name: 'Gusseted Flat Pouch 250 x 350 mm', unit: 'Pouch' },
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Flat Pouch', name: 'Gusseted Flat Pouch 250 x 400 mm', unit: 'Pouch' },
  { category: 'Sterilization', subCategory: 'Sterilization Gusseted Flat Pouch', name: 'Gusseted Flat Pouch 300 x 400 mm', unit: 'Pouch' },

  // 11. Safety Consumable
  { category: 'Safety Consumable', subCategory: 'Safety Consumable', name: 'Face mask', unit: 'Box' },
  { category: 'Safety Consumable', subCategory: 'Safety Consumable', name: 'Gloves', unit: 'Box' },
  { category: 'Safety Consumable', subCategory: 'Safety Consumable', name: 'Shoe Cover', unit: 'Box' },
  { category: 'Safety Consumable', subCategory: 'Safety Consumable', name: 'Head Cap', unit: 'Box' },

  // 12. Cassette & Cartridge -> ETO Gas
  { category: 'Cassette & Cartridge', subCategory: 'ETO Gas', name: 'ETO Gas (100 gm)', unit: 'Cartridge' },
  { category: 'Cassette & Cartridge', subCategory: 'ETO Gas', name: 'ETO Gas (170 gm)', unit: 'Cartridge' },

  // 12. Cassette & Cartridge -> Cassette & PCD
  { category: 'Cassette & Cartridge', subCategory: 'Cassette', name: 'Plasma Cassette', unit: 'Cassette' },
  { category: 'Cassette & Cartridge', subCategory: 'PCD', name: 'PCD (Steam)', unit: 'Piece' },
  { category: 'Cassette & Cartridge', subCategory: 'PCD', name: 'PCD (Plasma)', unit: 'Piece' },
  { category: 'Cassette & Cartridge', subCategory: 'PCD', name: 'PCD (ETO)', unit: 'Piece' },

  // 13. Spares
  { category: 'Spares', subCategory: 'Label Gun Ink', name: 'Label Gun Ink Refill (Miracle)', brand: 'Miracle', unit: 'Piece' },
  { category: 'Spares', subCategory: 'Sealing Belt', name: 'Sealing Teeth Belt', unit: 'Piece' },
  { category: 'Spares', subCategory: 'Sealing Belt', name: 'Sealing Belt (Teflon)', unit: 'Piece' },
  { category: 'Spares', subCategory: 'Oil', name: 'Vacuum Pump oil', unit: 'Bottle' },
  { category: 'Spares', subCategory: 'Plasma Spares', name: 'Black Filter', unit: 'Piece' },
  { category: 'Spares', subCategory: 'Plasma Spares', name: 'White Filter', unit: 'Piece' },
  { category: 'Spares', subCategory: 'Gun', name: 'Batch making Gun', unit: 'Piece' },
  { category: 'Spares', subCategory: 'Printer Roll', name: 'Printer Roll', unit: 'Roll' },
  { category: 'Spares', subCategory: 'Instrument', name: 'Incubator', unit: 'Unit' },
  { category: 'Spares', subCategory: 'Magnifying Glass', name: 'Magnifying Glass', unit: 'Piece' },
];

async function main() {
  console.log('--- STARTING COMPLETE DATA RESET & MASTER CATALOG SEEDING ---');

  // Step 1: Wipe all transactional, operational, and inventory data
  console.log('1. Purging operational, ledger, and transactional records...');
  await prisma.departmentReturn.deleteMany({});
  await prisma.departmentIssue.deleteMany({});
  await prisma.departmentIssueBatch.deleteMany({});
  await prisma.productionOutput.deleteMany({});
  await prisma.productionInput.deleteMany({});
  await prisma.productionRun.deleteMany({});
  await prisma.shipmentLine.deleteMany({});
  await prisma.shipment.deleteMany({});
  await prisma.reservation.deleteMany({});
  await prisma.stockRequestLine.deleteMany({});
  await prisma.stockRequest.deleteMany({});
  await prisma.stockAlertState.deleteMany({});
  await prisma.inventoryBalance.deleteMany({});
  await prisma.ledgerEntry.deleteMany({});
  await prisma.ledgerTransaction.deleteMany({});
  await prisma.importRow.deleteMany({});
  await prisma.importBatch.deleteMany({});
  console.log('   ✓ Cleared transactions, runs, requests, shipments, and ledger balances.');

  // Step 2: Purge existing catalog products & categories
  console.log('2. Purging old catalog items, versions, units, and categories...');
  await prisma.productUnit.deleteMany({});
  await prisma.productAttribute.deleteMany({});
  await prisma.productVersion.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  console.log('   ✓ Cleared old products and categories.');

  // Step 3: Ensure administrative user accounts
  console.log('3. Verifying administrative accounts...');
  const defaultPasswordHash = await bcrypt.hash('Password123!', 10);
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
  console.log(`   ✓ Super Admin account ensured: ${superAdmin.username}`);

  // Step 4: Seed Root Categories
  console.log('4. Creating root categories...');
  const rootCategoryNames = [...new Set(RAW_DATA.map((i) => i.category.trim()))];
  const rootCategoryMap = new Map<string, string>();

  for (const name of rootCategoryNames) {
    const cat = await prisma.category.create({
      data: {
        name,
        parentId: null,
        ownerScope: CatalogScope.COMPANY,
        projectId: null,
      },
    });
    rootCategoryMap.set(name, cat.id);
  }
  console.log(`   ✓ Created ${rootCategoryNames.length} root categories.`);

  // Step 5: Seed Subcategories
  console.log('5. Creating subcategories...');
  const subCategoryPairs = [
    ...new Set(RAW_DATA.map((i) => `${i.category.trim()}__${i.subCategory.trim()}`)),
  ];
  const subCategoryMap = new Map<string, string>();

  for (const pair of subCategoryPairs) {
    const [catName, subCatName] = pair.split('__');
    const parentId = rootCategoryMap.get(catName);
    if (!parentId) continue;

    const sub = await prisma.category.create({
      data: {
        name: subCatName,
        parentId,
        ownerScope: CatalogScope.COMPANY,
        projectId: null,
      },
    });
    subCategoryMap.set(pair, sub.id);
  }
  console.log(`   ✓ Created ${subCategoryPairs.length} nested subcategories.`);

  // Step 6: Seed Universal Products
  console.log('6. Seeding 116 universal medical products (isManufactured: false)...');
  let productCount = 0;

  for (const item of RAW_DATA) {
    const pair = `${item.category.trim()}__${item.subCategory.trim()}`;
    const categoryId = subCategoryMap.get(pair) || rootCategoryMap.get(item.category.trim());
    if (!categoryId) {
      console.warn(`Category not found for item: ${item.name}`);
      continue;
    }

    const trimmedName = item.name.trim();
    const brandName = item.brand?.trim() || null;
    const baseUnitName = item.unit.trim();
    const duplicateKey = `company::${trimmedName.toLowerCase()}::${(brandName || '').toLowerCase()}::${categoryId}`;

    await prisma.product.create({
      data: {
        name: trimmedName,
        brand: brandName,
        categoryId,
        ownerScope: CatalogScope.COMPANY,
        projectId: null,
        status: ProductStatus.APPROVED,
        isManufactured: false,
        kind: ProductKind.RAW_MATERIAL,
        quantityPrecision: 0,
        allowFractional: false,
        minQuantity: 0,
        minOrderQuantity: 1,
        duplicateKey,
        approvedById: superAdmin.id,
        approvedAt: new Date(),
        units: {
          create: [
            {
              unitName: baseUnitName,
              isBaseUnit: true,
              conversionToBase: 1,
              status: UnitStatus.ACTIVE,
            },
          ],
        },
      },
    });
    productCount++;
  }

  console.log(`   ✓ Successfully seeded ${productCount} standard catalog products.`);
  console.log('--- MASTER DATA SEEDING COMPLETE ---');
}

main()
  .catch((e) => {
    console.error('Master data seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
