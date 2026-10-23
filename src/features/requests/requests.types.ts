import {
  StockRequestDto,
  StockRequestLineDto,
  CreateStockRequestDto,
  UpdateStockRequestDto,
  RequestStatus,
} from '../../types/api';

export type StockRequest = StockRequestDto;
export type StockRequestLine = StockRequestLineDto;
export type CreateStockRequestPayload = CreateStockRequestDto;
export type UpdateStockRequestPayload = UpdateStockRequestDto;
export type { RequestStatus };
