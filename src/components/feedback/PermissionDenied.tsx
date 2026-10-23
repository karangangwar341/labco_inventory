import React from 'react';
import Link from 'next/link';
import { Button } from '../ui/Button';

export function PermissionDenied({
  message,
  requiredRoles,
  userRole,
}: {
  message?: string;
  requiredRoles?: string[];
  userRole?: string;
}) {
  const displayMessage =
    message ||
    (requiredRoles
      ? `This section requires [${requiredRoles.join(' or ')}] authorization. Your current role is [${userRole || 'ANONYMOUS'}].`
      : 'You do not have administrative authorization to view or execute actions on this resource.');

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-[#fee4e2] bg-[#fef3f2] max-w-xl mx-auto my-8 shadow-xs">
      <div className="text-3xl mb-2">🔒</div>
      <h3 className="text-sm font-bold text-[#b42318]">Access Restricted (RBAC Policy)</h3>
      <p className="text-xs text-[#b42318]/90 mt-1 mb-5 max-w-md leading-relaxed">
        {displayMessage}
      </p>
      <Link href="/">
        <Button variant="secondary" size="sm">
          Return to Authorized Overview
        </Button>
      </Link>
    </div>
  );
}

export default PermissionDenied;
