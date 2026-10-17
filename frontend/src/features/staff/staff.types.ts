export type StaffStatus = 'ACTIVE' | 'DISABLED' | 'LOCKED';

export interface ClientStaffWorkLog {
  id: string;
  staffMemberId: string;
  clientId: string;
  logDate: string;
  shiftType?: string | null;
  hoursWorked?: number | string | null;
  tasksCompleted: string;
  notes?: string | null;
  createdAt: string;
  clientName?: string | null;
  staffMember?: {
    id: string;
    staffNumber: string;
    fullName: string;
    roleTitle?: string | null;
  };
}

export interface ClientStaffMember {
  id: string;
  clientId: string;
  clientName?: string | null;
  staffNumber: string;
  fullName: string;
  roleTitle?: string | null;
  contact?: string | null;
  status: StaffStatus;
  createdAt: string;
  updatedAt: string;
  totalLogsCount?: number;
  latestLog?: ClientStaffWorkLog | null;
}

export interface CreateStaffMemberPayload {
  staffNumber: string;
  fullName: string;
  roleTitle?: string;
  contact?: string;
  clientId?: string;
}

export interface UpdateStaffMemberPayload {
  staffNumber?: string;
  fullName?: string;
  roleTitle?: string;
  contact?: string;
  status?: StaffStatus;
}

export interface CreateWorkLogPayload {
  logDate?: string;
  shiftType?: string;
  hoursWorked?: number;
  tasksCompleted: string;
  notes?: string;
}
