import React from 'react';
import { Badge } from '../ui/Badge';

interface StatusLabelProps {
  status: string;
}

export function StatusLabel({ status }: StatusLabelProps) {
  const norm = status.toUpperCase();

  switch (norm) {
    case 'APPROVED':
    case 'COMPLETED':
    case 'ACTIVE':
    case 'SUCCESS':
      return (
        <Badge variant="success">
          <span className="mr-1">✓</span>
          {status}
        </Badge>
      );
    case 'PENDING':
    case 'PENDING_APPROVAL':
    case 'IN_TRANSIT':
    case 'PROCESSING':
    case 'UNDER_REVIEW':
      return (
        <Badge variant="warning">
          <span className="mr-1">⏳</span>
          {status}
        </Badge>
      );
    case 'REJECTED':
    case 'CANCELLED':
    case 'DISCREPANCY_HOLD':
    case 'FAILED':
      return (
        <Badge variant="danger">
          <span className="mr-1">✕</span>
          {status}
        </Badge>
      );
    case 'SUPER_ADMIN':
    case 'PROD':
      return <Badge variant="purple">{status}</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}

export default StatusLabel;
