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

export interface CycleRecipeInput {
  productId: string;
  productName: string;
  sku?: string | null;
  quantity: number;
  baseQuantity: number;
  unitName: string;
  currentAvailableStock: number;
  isStockSufficient: boolean;
}

export interface ProductionCycle {
  cycleKey: string;
  cycleReference: string;
  projectId: string;
  projectName: string;
  outputProductId: string | null;
  outputProductName: string;
  outputProductSku: string | null;
  latestRunId: string;
  latestRunNumber: string;
  totalExecutions: number;
  lastExecutedAt: string;
  lastStatus: ProductionStatus;
  currentStock: number;
  minQuantity: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  canRunNow: boolean;
  hasSufficientRawMaterials: boolean;
  plannedOutput: number;
  unitName: string;
  recipeInputs: CycleRecipeInput[];
}

export interface ReRunCyclePayload {
  plannedOutput?: number;
  notes?: string;
}

export interface CycleExecutionHistoryItem {
  id: string;
  runNumber: string;
  cycleReference: string;
  projectId: string;
  projectName: string;
  outputProductName: string;
  plannedOutput: number | null;
  actualOutput: number | null;
  yieldEfficiency: number | null;
  wastage: number | null;
  status: ProductionStatus;
  submittedBy: string;
  submittedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string | null;
}

export interface MaterialConsumptionItem {
  productId: string;
  productName: string;
  totalConsumed: number;
  unitName: string;
}

export interface CycleBreakdownItem {
  cycleReference: string;
  projectId: string;
  projectName: string;
  outputProductName: string;
  outputProductSku: string | null;
  runsCount: number;
  approvedCount: number;
  totalOutput: number;
  avgYield: number | null;
  lastRunAt: string;
  lastStatus: ProductionStatus;
  latestRunId: string;
}

export interface ManufacturingAnalytics {
  summary: {
    totalCycles: number;
    totalRuns: number;
    approvedRuns: number;
    pendingRuns: number;
    draftRuns: number;
    rejectedRuns: number;
    totalProduced: number;
    totalPlanned: number;
    avgYieldEfficiency: number;
    totalWastage: number;
    wastageRate: number;
    lowStockCyclesCount: number;
  };
  cycleBreakdown: CycleBreakdownItem[];
  materialConsumption: MaterialConsumptionItem[];
  executionHistory: CycleExecutionHistoryItem[];
}
