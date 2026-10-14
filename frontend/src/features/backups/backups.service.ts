import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { BackupRecord, BackupStatusSummary, SystemHealth } from './backups.types';

export const backupsService = {
  getBackups: async (params?: { status?: string; limit?: number }): Promise<BackupRecord[]> => {
    return apiClient.get<BackupRecord[]>(endpoints.backups.list(params));
  },

  getBackupStatusSummary: async (): Promise<BackupStatusSummary> => {
    return apiClient.get<BackupStatusSummary>(endpoints.backups.summary());
  },

  triggerBackup: async (backupType = 'MANUAL_PRE_MIGRATION'): Promise<BackupRecord> => {
    return apiClient.post<BackupRecord>(endpoints.backups.trigger(), { backupType });
  },

  getHealth: async (): Promise<SystemHealth> => {
    return apiClient.get<SystemHealth>(endpoints.health.check());
  },
};
