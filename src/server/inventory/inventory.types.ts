import { Decimal } from '@prisma/client/runtime/library';

export interface CalculatedBalanceView {
  id: string;
  locationId: string;
  locationName?: string;
  locationType?: 'WAREHOUSE' | 'PROJECT';
  warehouseId?: string | null;
  projectId?: string | null;
  productId: string;
  productName?: string;
  productKind?: string;
  brand?: string | null;
  categoryName?: string | null;
  categoryId?: string | null;
  subCategoryName?: string | null;
  subCategoryId?: string | null;
  unit?: string | null;
  minThreshold?: number;
  usableQty: Decimal;
  reservedQty: Decimal;
  physicalQty: Decimal; // Physical stock equals usable stock; damaged stock is removed by stock-out.
  availableQty: Decimal; // Usable - Reserved >= 0
  updatedAt: Date;
}

export function calculateProjectedQuantities(balance: {
  usableQty: Decimal;
  reservedQty: Decimal;
}): { physicalQty: Decimal; availableQty: Decimal } {
  const physicalQty = balance.usableQty;

  // Available = Usable - Reserved (enforced >= 0)
  const availableQty = balance.usableQty.minus(balance.reservedQty);

  return { physicalQty, availableQty };
}
