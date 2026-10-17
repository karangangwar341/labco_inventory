import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';

export const invalidation = {
  /**
   * After request creation/editing/cancellation:
   * Invalidate requests, approval queue, and dashboard.
   */
  afterRequestMutation: async (queryClient: QueryClient) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.requests.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.summary() }),
    ]);
  },

  /**
   * After inventory posting or approval:
   * Invalidate inventory balances, ledger transactions, request lists, approvals, shipments.
   */
  afterInventoryApproval: async (queryClient: QueryClient) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.requests.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.shipments.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
    ]);
  },

  /**
   * After catalog edits:
   * Invalidate product lists and category lookups.
   */
  afterCatalogMutation: async (queryClient: QueryClient) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.session.all }),
    ]);
  },

  /**
   * After shipment dispatch or receipt:
   * Invalidate shipments, inventory balances, and notifications.
   */
  afterShipmentMutation: async (queryClient: QueryClient) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.shipments.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
    ]);
  },

  /**
   * After manufacturing run update:
   * Invalidate manufacturing runs and inventory balances.
   */
  afterManufacturingMutation: async (queryClient: QueryClient) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.manufacturing.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
    ]);
  },

  /**
   * After department creation or update:
   * Invalidate departments and issues.
   */
  afterDepartmentMutation: async (queryClient: QueryClient) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.departments.all });
  },

  /**
   * After manual backup trigger:
   * Invalidate backups list and summary.
   */
  afterBackupTrigger: async (queryClient: QueryClient) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.backups.all });
  },

  /**
   * Complete memory cache wipe on logout, session replacement, or tenant switch.
   */
  clearAll: (queryClient: QueryClient) => {
    queryClient.clear();
  },
};
