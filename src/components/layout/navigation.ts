import { UserRole } from '@/types/api';

export type NavIconName =
  | 'overview'
  | 'inventory'
  | 'requests'
  | 'approvals'
  | 'shipments'
  | 'catalog'
  | 'manufacturing'
  | 'departments'
  | 'imports'
  | 'reports'
  | 'users'
  | 'settings'
  | 'backups'
  | 'help';

export interface SubNavItem {
  href: string;
  label: string;
  roles?: UserRole[];
  exact?: boolean;
}

export interface MainDomain {
  id: string;
  label: string;
  defaultHref: string;
  iconName: NavIconName;
  roles: UserRole[];
  matchPaths: string[];
  subItems: SubNavItem[];
}

/**
 * MAIN DOMAINS (Primary Sidebar - Level 1 Navigation)
 * Represents high-level operational modules.
 */
export const MAIN_DOMAINS: MainDomain[] = [
  {
    id: 'operations',
    label: 'Daily Operations',
    defaultHref: '/',
    iconName: 'overview',
    roles: ['SUPER_ADMIN', 'STORE_ADMIN', 'PROJECT_ADMIN'],
    matchPaths: ['/', '/inventory', '/shipments'],
    subItems: [
      { href: '/', label: 'Overview', exact: true },
      { href: '/inventory', label: 'Stock & Inventory', roles: ['SUPER_ADMIN', 'STORE_ADMIN'] },
      { href: '/shipments', label: 'Outgoing Deliveries', roles: ['STORE_ADMIN'] },
      { href: '/shipments', label: 'Incoming Deliveries', roles: ['PROJECT_ADMIN'] },
      { href: '/shipments', label: 'Shipments & Deliveries', roles: ['SUPER_ADMIN'] },
    ],
  },
  {
    id: 'requests',
    label: 'Stock Movements',
    defaultHref: '/requests',
    iconName: 'requests',
    roles: ['SUPER_ADMIN', 'STORE_ADMIN', 'PROJECT_ADMIN'],
    matchPaths: ['/requests', '/approvals'],
    subItems: [
      { href: '/requests', label: 'All Requests & Transfers', exact: true },
      { href: '/requests/new', label: 'New Transfer Request', roles: ['SUPER_ADMIN', 'STORE_ADMIN'] },
      { href: '/departments?tab=ISSUES', label: 'Issue to Departments', roles: ['PROJECT_ADMIN'] },
      { href: '/approvals', label: 'Pending Approvals', roles: ['SUPER_ADMIN'] },
    ],
  },
  {
    id: 'manufacturing',
    label: 'Production & Factory',
    defaultHref: '/manufacturing',
    iconName: 'manufacturing',
    roles: ['PROJECT_ADMIN'],
    matchPaths: ['/manufacturing', '/departments'],
    subItems: [
      { href: '/manufacturing', label: 'Production Runs & Batches' },
      { href: '/departments', label: 'Department Usage & Stock', roles: ['PROJECT_ADMIN'] },
      { href: '/staff', label: 'Staff & Daily Work Logs', roles: ['PROJECT_ADMIN'] },
    ],
  },
  {
    id: 'staff',
    label: 'Team & Staff',
    defaultHref: '/staff',
    iconName: 'users',
    roles: ['PROJECT_ADMIN'],
    matchPaths: ['/staff'],
    subItems: [
      { href: '/staff', label: 'Staff Directory & Attendance', exact: true },
    ],
  },
  {
    id: 'catalog',
    label: 'Products & Bills',
    defaultHref: '/catalog',
    iconName: 'catalog',
    roles: ['SUPER_ADMIN', 'STORE_ADMIN', 'PROJECT_ADMIN'],
    matchPaths: ['/catalog', '/imports'],
    subItems: [
      { href: '/catalog', label: 'Product & Item Catalog' },
      { href: '/imports', label: 'Scan Invoices & Bills (AI)' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports & Downloads',
    defaultHref: '/reports',
    iconName: 'reports',
    roles: ['SUPER_ADMIN', 'STORE_ADMIN', 'PROJECT_ADMIN'],
    matchPaths: ['/reports'],
    subItems: [
      { href: '/reports', label: 'Stock Reports & Excel Exports' },
    ],
  },
  {
    id: 'admin',
    label: 'System Administration',
    defaultHref: '/admin/projects',
    iconName: 'settings',
    roles: ['SUPER_ADMIN'],
    matchPaths: ['/admin', '/backups'],
    subItems: [
      { href: '/admin/projects', label: 'Hospital & Lab Projects' },
      { href: '/admin/warehouses', label: 'Central Warehouses' },
      { href: '/admin/users', label: 'User Accounts & Roles' },
      { href: '/admin/settings', label: 'System Settings & Approvals' },
      { href: '/backups', label: 'Database Backups & Health' },
    ],
  },
];

export const HELP_NAV_ITEM = {
  href: '/help',
  label: 'How to use this system',
  iconName: 'help' as NavIconName,
  roles: ['SUPER_ADMIN', 'STORE_ADMIN', 'PROJECT_ADMIN'] as UserRole[],
};

/**
 * Utility helper: Detect active Main Domain based on current URL pathname
 */
export function getActiveDomain(pathname: string | null): MainDomain | null {
  if (!pathname) return MAIN_DOMAINS[0];
  
  for (const domain of MAIN_DOMAINS) {
    for (const pattern of domain.matchPaths) {
      if (pattern === '/') {
        if (pathname === '/') return domain;
      } else if (pathname === pattern || pathname.startsWith(`${pattern}/`)) {
        return domain;
      }
    }
  }

  return MAIN_DOMAINS[0];
}
