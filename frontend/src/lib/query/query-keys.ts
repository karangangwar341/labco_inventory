export const queryKeys = {
  // Session & User
  session: {
    all: ['session'] as const,
    profile: (userId?: string) => ['session', 'profile', userId || 'anonymous'] as const,
    bootstrap: (userId: string) => ['session', 'bootstrap', userId] as const,
  },

  // Inventory & Balances
  inventory: {
    all: ['inventory'] as const,
    locations: (userId?: string) => ['inventory', 'locations', userId || 'current-user'] as const,
    balances: (scope?: string, filters?: Record<string, unknown>) =>
      ['inventory', 'balances', { scope: scope || 'default', ...filters }] as const,
    transactions: (scope?: string, filters?: Record<string, unknown>) =>
      ['inventory', 'transactions', { scope: scope || 'default', ...filters }] as const,
    summary: (scope?: string) => ['inventory', 'summary', scope || 'default'] as const,
  },

  // Products & Catalogs
  catalog: {
    all: ['catalog'] as const,
    products: (scope?: string, filters?: Record<string, unknown>) =>
      ['catalog', 'products', { scope: scope || 'company', ...filters }] as const,
    product: (id: string) => ['catalog', 'product', id] as const,
    categories: (scope?: string) => ['catalog', 'categories', scope || 'all'] as const,
    units: () => ['catalog', 'units'] as const,
    manufacturingOptions: (clientId?: string) => ['catalog', 'manufacturing-options', clientId || 'current-client'] as const,
  },

  // Stock Requests
  requests: {
    all: ['requests'] as const,
    list: (scope?: string, filters?: Record<string, unknown>) =>
      ['requests', 'list', { scope: scope || 'default', ...filters }] as const,
    detail: (id: string) => ['requests', 'detail', id] as const,
  },

  // Imports
  imports: {
    all: ['imports'] as const,
    batches: (userId?: string) => ['imports', 'batches', userId || 'current-user'] as const,
    batch: (id: string) => ['imports', 'batch', id] as const,
  },

  // Shipments & Transfers
  shipments: {
    all: ['shipments'] as const,
    list: (scope?: string, filters?: Record<string, unknown>) =>
      ['shipments', 'list', { scope: scope || 'default', ...filters }] as const,
    detail: (id: string) => ['shipments', 'detail', id] as const,
  },

  // Super Admin Approvals
  approvals: {
    all: ['approvals'] as const,
    queue: (filters?: Record<string, unknown>) => ['approvals', 'queue', { ...filters }] as const,
  },

  // Departments
  departments: {
    all: ['departments'] as const,
    list: (clientId?: string) => ['departments', 'list', clientId || 'default'] as const,
    issues: (clientId?: string) => ['departments', 'issues', clientId || 'default'] as const,
    issueDraft: (clientId?: string) => ['departments', 'issue-draft', clientId || 'default'] as const,
  },

  // Manufacturing / Production Runs
  manufacturing: {
    all: ['manufacturing'] as const,
    list: (scope?: string, filters?: Record<string, unknown>) =>
      ['manufacturing', 'list', { scope: scope || 'default', ...filters }] as const,
    cycles: (clientId?: string) => ['manufacturing', 'cycles', clientId || 'default'] as const,
    analytics: (filters?: Record<string, unknown>) => ['manufacturing', 'analytics', { ...filters }] as const,
    detail: (id: string) => ['manufacturing', 'detail', id] as const,
  },

  // Notifications
  notifications: {
    all: ['notifications'] as const,
    list: (userId?: string) => ['notifications', 'list', userId || 'me'] as const,
    unread: (userId?: string) => ['notifications', 'unread', userId || 'me'] as const,
    settings: () => ['notifications', 'settings'] as const,
  },

  // System Health & Backups
  backups: {
    all: ['backups'] as const,
    list: (filters?: Record<string, unknown>) => ['backups', 'list', { ...filters }] as const,
    summary: () => ['backups', 'summary'] as const,
    health: () => ['backups', 'health'] as const,
  },

  // Super Admin organization and account management
  administration: {
    all: ['administration'] as const,
    users: () => ['administration', 'users'] as const,
    clients: () => ['administration', 'clients'] as const,
    client: (id: string) => ['administration', 'client', id] as const,
    warehouses: () => ['administration', 'warehouses'] as const,
  },

  // Reports
  reports: {
    all: ['reports'] as const,
    view: (reportType: string, params?: Record<string, unknown>) =>
      ['reports', reportType, { ...params }] as const,
  },

  // Client Staff & HR Management
  staff: {
    all: ['staff'] as const,
    list: (clientId?: string) => ['staff', 'list', clientId || 'default'] as const,
    detail: (id: string) => ['staff', 'detail', id] as const,
    workLogs: (clientId?: string) => ['staff', 'work-logs', clientId || 'default'] as const,
    staffWorkLogs: (staffId: string) => ['staff', staffId, 'work-logs'] as const,
  },
};
