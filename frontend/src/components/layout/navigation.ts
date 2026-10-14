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
  | 'backups';

export interface NavItem {
  href: string;
  label: string;
  iconName: NavIconName;
  roles: UserRole[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAVIGATION_GROUPS: NavGroup[] = [
  {
    title: 'Daily work',
    items: [
      {
        href: '/',
        label: 'Overview',
        iconName: 'overview',
        roles: ['SUPER_ADMIN', 'STORE_ADMIN', 'CLIENT_ADMIN'],
      },
      {
        href: '/inventory',
        label: 'Inventory',
        iconName: 'inventory',
        roles: ['SUPER_ADMIN', 'STORE_ADMIN', 'CLIENT_ADMIN'],
      },
      {
        href: '/requests',
        label: 'Stock requests',
        iconName: 'requests',
        roles: ['SUPER_ADMIN', 'STORE_ADMIN', 'CLIENT_ADMIN'],
      },
      {
        href: '/approvals',
        label: 'Approvals',
        iconName: 'approvals',
        roles: ['SUPER_ADMIN'],
      },
      {
        href: '/shipments',
        label: 'Shipments',
        iconName: 'shipments',
        roles: ['SUPER_ADMIN', 'STORE_ADMIN', 'CLIENT_ADMIN'],
      },
    ],
  },
  {
    title: 'Operations',
    items: [
      {
        href: '/catalog',
        label: 'Catalog',
        iconName: 'catalog',
        roles: ['SUPER_ADMIN', 'STORE_ADMIN', 'CLIENT_ADMIN'],
      },
      {
        href: '/manufacturing',
        label: 'Manufacturing',
        iconName: 'manufacturing',
        roles: ['SUPER_ADMIN', 'CLIENT_ADMIN'],
      },
      {
        href: '/departments',
        label: 'Departments',
        iconName: 'departments',
        roles: ['SUPER_ADMIN', 'CLIENT_ADMIN'],
      },
      {
        href: '/imports',
        label: 'Imports',
        iconName: 'imports',
        roles: ['SUPER_ADMIN', 'STORE_ADMIN', 'CLIENT_ADMIN'],
      },
      {
        href: '/reports',
        label: 'Reports',
        iconName: 'reports',
        roles: ['SUPER_ADMIN', 'STORE_ADMIN', 'CLIENT_ADMIN'],
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        href: '/admin/users',
        label: 'Users',
        iconName: 'users',
        roles: ['SUPER_ADMIN'],
      },
      {
        href: '/admin/settings',
        label: 'Settings',
        iconName: 'settings',
        roles: ['SUPER_ADMIN'],
      },
      {
        href: '/backups',
        label: 'Backups',
        iconName: 'backups',
        roles: ['SUPER_ADMIN'],
      },
    ],
  },
];
