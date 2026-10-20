export type ApprovalTab =
  | 'REQUESTS'
  | 'SHIPMENTS'
  | 'MANUFACTURING'
  | 'DEPARTMENTS'
  | 'CORRECTIONS';

export interface QueueItem {
  id: string;
  type: string;
  requester: string;
  location: string;
  details: string;
  quantitySummary: string;
  lineItems?: QueueLineItem[];
  createdAt: string;
  priority: 'NORMAL' | 'URGENT';
}

export interface QueueLineItem {
  id: string;
  productName: string;
  quantity: string;
  unitName?: string;
  batchNumber?: string | null;
  expiryDate?: string | null;
  label?: string;
  quantityNote?: string;
  stockWarning?: string;
}
