export interface BackupRecord {
  id: string;
  backupType: 'AUTOMATED_DAILY' | 'MANUAL_PRE_MIGRATION' | 'POINT_IN_TIME';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  sizeBytes?: number;
  locationUri?: string;
  checksum?: string;
  startedAt: string;
  completedAt?: string;
  failureReason?: string;
}

export interface BackupStatusSummary {
  lastSuccessfulBackup: BackupRecord | null;
  consecutiveFailures: number;
  persistentAlertActive: boolean;
  totalCompletedBackups: number;
}

export interface SystemHealth {
  status: 'OK' | 'DEGRADED' | 'DOWN';
  uptimeSeconds: number;
  database: {
    status: 'UP' | 'DOWN';
    latencyMs: number;
  };
  backups: {
    persistentAlert: boolean;
    consecutiveFailures: number;
  };
  memoryUsageMb: number;
}
