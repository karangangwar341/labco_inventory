import React from 'react';
import { Badge } from '../ui/Badge';

interface StatusLabelProps {
  status: string;
}

export function StatusLabel({ status }: StatusLabelProps) {
  const norm = (status || '').toUpperCase();

  switch (norm) {
    case 'APPROVED':
    case 'COMPLETED':
    case 'ACTIVE':
    case 'SUCCESS':
      return (
        <Badge variant="success" size="sm" withDot>
          {norm === 'APPROVED' ? 'Approved' : norm === 'COMPLETED' ? 'Completed' : 'Active'}
        </Badge>
      );
    case 'PENDING':
    case 'PENDING_APPROVAL':
    case 'IN_TRANSIT':
    case 'PROCESSING':
    case 'UNDER_REVIEW':
      return (
        <Badge variant="warning" size="sm" withDot>
          {norm === 'PENDING_APPROVAL' ? 'Pending Approval' : norm === 'IN_TRANSIT' ? 'In Transit' : 'Pending'}
        </Badge>
      );
    case 'AWAITING_RECEIPT_APPROVAL':
      return (
        <Badge variant="warning" size="sm" withDot>
          Awaiting Receipt Approval
        </Badge>
      );
    case 'DRAFT':
      return (
        <Badge variant="neutral" size="sm" withDot>
          Draft
        </Badge>
      );
    case 'REJECTED':
    case 'CANCELLED':
    case 'DISCREPANCY_HOLD':
    case 'FAILED':
      return (
        <Badge variant="danger" size="sm" withDot>
          {norm === 'REJECTED' ? 'Rejected' : norm === 'CANCELLED' ? 'Cancelled' : norm === 'DISCREPANCY_HOLD' ? 'Discrepancy Hold' : 'Failed'}
        </Badge>
      );
    case 'SUPER_ADMIN':
    case 'PROD':
      return <Badge variant="purple" size="sm">{status}</Badge>;
    default:
      return <Badge variant="neutral" size="sm">{status.replaceAll('_', ' ')}</Badge>;
  }
}

export default StatusLabel;
