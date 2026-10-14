import {
  ProductionRunDto,
  CreateProductionRunDto,
  ProductionStatus,
  BOMItemDto,
} from '../../types/api';

export type ProductionRun = ProductionRunDto;
export type CreateProductionRunPayload = CreateProductionRunDto;
export type BOMItem = BOMItemDto;
export type { ProductionStatus };
