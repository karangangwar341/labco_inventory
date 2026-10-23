/**
 * Authoritative backend REST API endpoint route builders.
 * Matches backend NestJS controllers prefix `/api/v1`.
 */

export const endpoints = {
  auth: {
    login: () => "/auth/login",
    logout: () => "/auth/logout",
    me: () => "/me",
    bootstrap: () => "/me/bootstrap",
  },

  inventory: {
    locations: () => "/inventory/locations",
    lowStockCount: () => "/inventory/low-stock-count",
    balances: (params?: {
      locationId?: string;
      productId?: string;
      limit?: number;
      page?: number;
    }) => {
      const q = new URLSearchParams();
      if (params?.locationId) q.set("locationId", params.locationId);
      if (params?.productId) q.set("productId", params.productId);
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.page) q.set("page", String(params.page));
      const qs = q.toString();
      return qs ? `/inventory/balances?${qs}` : "/inventory/balances";
    },
    transactions: () => "/inventory/transactions",
    reverseTransaction: (id: string) =>
      `/inventory/transactions/reversal/${id}`,
    correctTransaction: (id: string) => `/inventory/transactions/${id}/correct`,
  },

  stockRequests: {
    list: (params?: {
      status?: string;
      requestType?: string;
      projectId?: string;
      warehouseId?: string;
      limit?: number;
      page?: number;
    }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      if (params?.requestType) q.set("requestType", params.requestType);
      if (params?.projectId) q.set("projectId", params.projectId);
      if (params?.warehouseId) q.set("warehouseId", params.warehouseId);
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.page) q.set("page", String(params.page));
      const qs = q.toString();
      return qs ? `/stock-requests?${qs}` : "/stock-requests";
    },
    byId: (id: string) => `/stock-requests/${id}`,
    create: () => "/stock-requests",
    submit: (id: string) => `/stock-requests/${id}/submit`,
    update: (id: string) => `/stock-requests/${id}`,
    cancel: (id: string) => `/stock-requests/${id}/cancel`,
    approve: (id: string) => `/stock-requests/${id}/approve`,
    reject: (id: string) => `/stock-requests/${id}/reject`,
  },

  shipments: {
    list: (params?: { status?: string; limit?: number; page?: number }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.page) q.set("page", String(params.page));
      const qs = q.toString();
      return qs ? `/shipments?${qs}` : "/shipments";
    },
    byId: (id: string) => `/shipments/${id}`,
    receive: (id: string) => `/shipments/${id}/receive`,
    approveReceipt: (id: string) => `/shipments/${id}/approve-receipt`,
    resolveDiscrepancy: (id: string) => `/shipments/${id}/resolve-discrepancy`,
  },

  catalog: {
    products: () => "/products",
    productById: (id: string) => `/products/${id}`,
    reviewProduct: (id: string) => `/products/${id}/review`,
    reviewProductVersion: (id: string, versionId: string) =>
      `/products/${id}/versions/${versionId}/review`,
    categories: () => "/categories",
    units: () => "/units",
    unitByName: (name: string) => `/units/${encodeURIComponent(name)}`,
  },

  manufacturing: {
    productionRuns: (params?: { status?: string; projectId?: string }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      if (params?.projectId) q.set("projectId", params.projectId);
      const qs = q.toString();
      return qs ? `/production-runs?${qs}` : "/production-runs";
    },
    cycles: () => "/production-runs/cycles",
    analytics: (params?: {
      projectId?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
    }) => {
      const q = new URLSearchParams();
      if (params?.projectId) q.set("projectId", params.projectId);
      if (params?.startDate) q.set("startDate", params.startDate);
      if (params?.endDate) q.set("endDate", params.endDate);
      if (params?.status) q.set("status", params.status);
      const qs = q.toString();
      return qs ? `/production-runs/analytics?${qs}` : "/production-runs/analytics";
    },
    checkLowStockCycles: () => "/production-runs/check-low-stock-cycles",
    reRun: (id: string) => `/production-runs/${id}/re-run`,
    byId: (id: string) => `/production-runs/${id}`,
    update: (id: string) => `/production-runs/${id}`,
    delete: (id: string) => `/production-runs/${id}`,
    create: () => "/production-runs",
    submit: (id: string) => `/production-runs/${id}/submit`,
    submitBatch: () => "/production-runs/batch-submit",
    approve: (id: string) => `/production-runs/${id}/approve`,
    approveBatch: () => "/production-runs/batch-approve",
    reject: (id: string) => `/production-runs/${id}/reject`,
    rejectBatch: () => "/production-runs/batch-reject",
    complete: (id: string) => `/production-runs/${id}/complete`,
  },

  departments: {
    list: (params?: { projectId?: string }) => {
      const q = new URLSearchParams();
      if (params?.projectId) q.set("projectId", params.projectId);
      const qs = q.toString();
      return qs ? `/departments?${qs}` : "/departments";
    },
    byId: (id: string) => `/departments/${id}`,
    create: () => "/departments",
    update: (id: string) => `/departments/${id}`,
    approve: (id: string) => `/departments/${id}/approve`,
    reject: (id: string) => `/departments/${id}/reject`,
    issues: (params?: {
      projectId?: string;
      departmentId?: string;
      status?: string;
    }) => {
      const q = new URLSearchParams();
      if (params?.projectId) q.set("projectId", params.projectId);
      if (params?.departmentId) q.set("departmentId", params.departmentId);
      if (params?.status) q.set("status", params.status);
      const qs = q.toString();
      return qs ? `/departments/issues?${qs}` : "/departments/issues";
    },
    issueById: (id: string) => `/departments/issues/${id}`,
    issueDraft: () => "/departments/issues/draft",
    issueBatches: (params?: { status?: string }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      const qs = q.toString();
      return qs ? `/departments/issues/batches?${qs}` : "/departments/issues/batches";
    },
    issueBatchLines: (id: string) => `/departments/issues/batches/${id}/lines`,
    submitIssueBatch: (id: string) => `/departments/issues/batches/${id}/submit`,
    approveIssueBatch: (id: string) => `/departments/issues/batches/${id}/approve`,
    rejectIssueBatch: (id: string) => `/departments/issues/batches/${id}/reject`,
    createIssue: () => "/departments/issues",
    approveIssue: (id: string) => `/departments/issues/${id}/approve`,
    rejectIssue: (id: string) => `/departments/issues/${id}/reject`,
    returns: (params?: { projectId?: string; departmentId?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.projectId) q.set("projectId", params.projectId);
      if (params?.departmentId) q.set("departmentId", params.departmentId);
      if (params?.status) q.set("status", params.status);
      const qs = q.toString();
      return qs ? `/departments/returns?${qs}` : "/departments/returns";
    },
    createReturn: () => "/departments/returns",
    approveReturn: (id: string) => `/departments/returns/${id}/approve`,
    rejectReturn: (id: string) => `/departments/returns/${id}/reject`,
  },

  imports: {
    batches: (params?: { importType?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.importType) q.set("importType", params.importType);
      if (params?.status) q.set("status", params.status);
      const qs = q.toString();
      return qs ? `/import-batches?${qs}` : "/import-batches";
    },
    byId: (id: string) => `/import-batches/${id}`,
    create: () => "/import-batches",
    updateRow: (batchId: string, rowId: string) =>
      `/import-batches/${batchId}/rows/${rowId}`,
    commit: (batchId: string) => `/import-batches/${batchId}/approve`,
    approve: (batchId: string) => `/import-batches/${batchId}/approve`,
    reject: (batchId: string) => `/import-batches/${batchId}/reject`,
    validate: (batchId: string) => `/import-batches/${batchId}/validate`,
    submit: (batchId: string) => `/import-batches/${batchId}/submit`,
    errors: (batchId: string) => `/import-batches/${batchId}/errors`,
  },

  notifications: {
    list: (params?: { read?: boolean; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.read !== undefined) q.set("read", String(params.read));
      if (params?.limit) q.set("limit", String(params.limit));
      const qs = q.toString();
      return qs ? `/notifications?${qs}` : "/notifications";
    },
    markRead: (id: string) => `/notifications/${id}/read`,
    markAllRead: () => "/notifications/read-all",
    settings: () => "/notifications/settings",
  },

  reports: {
    byType: (reportType: string, params?: Record<string, string>) => {
      const q = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") q.set(k, v);
        });
      }
      const qs = q.toString();
      return qs ? `/reports/${reportType}?${qs}` : `/reports/${reportType}`;
    },
    auditHistory: () => "/reports/audit-history",
  },

  backups: {
    list: (params?: { status?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      if (params?.limit) q.set("limit", String(params.limit));
      const qs = q.toString();
      return qs ? `/backups?${qs}` : "/backups";
    },
    summary: () => "/backups/summary",
    trigger: () => "/backups",
    restoreDrill: (id: string) => `/backups/${id}/restore-drill`,
  },

  health: {
    check: () => "/backups/health",
  },

  users: {
    list: () => "/users",
    byId: (id: string) => `/users/${id}`,
    create: () => "/users",
    disable: (id: string) => `/users/${id}/disable`,
    resetPassword: (id: string) => `/users/${id}/reset-password`,
  },

  organization: {
    projects: () => "/projects",
    projectById: (id: string) => `/projects/${id}`,
    createProject: () => "/projects",
    updateProject: (id: string) => `/projects/${id}`,
    projectWarehouses: (id: string) => `/projects/${id}/warehouses`,
    projectWarehouseAssignment: (projectId: string, warehouseId: string) =>
      `/projects/${projectId}/warehouses/${warehouseId}`,
    warehouses: () => "/warehouses",
    warehouseById: (id: string) => `/warehouses/${id}`,
    createWarehouse: () => "/warehouses",
    updateWarehouse: (id: string) => `/warehouses/${id}`,
  },

  staff: {
    list: (params?: { projectId?: string; page?: number; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.projectId) q.set("projectId", params.projectId);
      if (params?.page) q.set("page", String(params.page));
      if (params?.limit) q.set("limit", String(params.limit));
      const qs = q.toString();
      return qs ? `/project-staff?${qs}` : "/project-staff";
    },
    byId: (id: string) => `/project-staff/${id}`,
    create: () => "/project-staff",
    update: (id: string) => `/project-staff/${id}`,
    delete: (id: string) => `/project-staff/${id}`,
    workLogs: (params?: {
      projectId?: string;
      page?: number;
      limit?: number;
    }) => {
      const q = new URLSearchParams();
      if (params?.projectId) q.set("projectId", params.projectId);
      if (params?.page) q.set("page", String(params.page));
      if (params?.limit) q.set("limit", String(params.limit));
      const qs = q.toString();
      return qs ? `/project-staff/work-logs?${qs}` : "/project-staff/work-logs";
    },
    staffWorkLogs: (staffId: string) => `/project-staff/${staffId}/work-logs`,
    createWorkLog: (staffId: string) => `/project-staff/${staffId}/work-logs`,
  },
};
