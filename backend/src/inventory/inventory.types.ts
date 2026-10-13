import { Decimal } from '@prisma/client/runtime/library';

export interface CalculatedBalanceView {
  id: string;
  locationId: string;
  productId: string;
  batchId: string | null;
  usableQty: Decimal;
  reservedQty: Decimal;
  damagedQty: Decimal;
  expiredQty: Decimal;
  physicalQty: Decimal; // Usable + Damaged + Expired (D-004)
  availableQty: Decimal; // Usable - Reserved >= 0 (D-004)
  updatedAt: Date;
}

export function calculateProjectedQuantities(balance: {
  usableQty: Decimal;
  reservedQty: Decimal;
  damagedQty: Decimal;
  expiredQty: Decimal;
}): { physicalQty: Decimal; availableQty: Decimal } {
  // Physical = Usable + Damaged + Expired
  const physicalQty = balance.usableQty.plus(balance.damagedQty).plus(balance.expiredQty);

  // Available = Usable - Reserved (enforced >= 0)
  const availableQty = balance.usableQty.minus(balance.reservedQty);

  return { physicalQty, availableQty };
}
