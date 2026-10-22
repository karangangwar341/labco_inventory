import { UserRole } from '../../types/common';

/**
 * UI visibility helpers.
 * Note: These checks are for client-side navigation and action display only.
 * The NestJS backend enforces authoritative role-based access on every endpoint.
 */

export function canApproveWorkflows(role?: UserRole): boolean {
  return role === 'SUPER_ADMIN';
}

export function canManageCatalogs(role?: UserRole): boolean {
  return role === 'SUPER_ADMIN';
}

export function canCreateWarehouseDispatches(role?: UserRole): boolean {
  return role === 'SUPER_ADMIN' || role === 'STORE_ADMIN';
}

export function canManageDepartments(role?: UserRole): boolean {
  return role === 'SUPER_ADMIN' || role === 'PROJECT_ADMIN';
}

export function canViewWarehouseIdentity(role?: UserRole): boolean {
  return role !== 'PROJECT_ADMIN';
}

export function canManageUsers(role?: UserRole): boolean {
  return role === 'SUPER_ADMIN';
}

export function canReceiveShipments(role?: UserRole): boolean {
  return role === 'SUPER_ADMIN' || role === 'PROJECT_ADMIN';
}
