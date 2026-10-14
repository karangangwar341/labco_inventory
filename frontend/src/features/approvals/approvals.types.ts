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
  createdAt: string;
  priority: 'NORMAL' | 'URGENT';
}
