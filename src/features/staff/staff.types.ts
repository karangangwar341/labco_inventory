export type StaffStatus = 'ACTIVE' | 'DISABLED' | 'LOCKED';

export interface ProjectStaffWorkLog {
  id: string;
  staffMemberId: string;
  projectId: string;
  logDate: string;
  shiftType?: string | null;
  hoursWorked?: number | string | null;
  tasksCompleted: string;
  notes?: string | null;
  createdAt: string;
  projectName?: string | null;
  staffMember?: {
    id: string;
    staffNumber: string;
    fullName: string;
    roleTitle?: string | null;
  };
}

export interface ProjectStaffMember {
  id: string;
  projectId: string;
  projectName?: string | null;
  staffNumber: string;
  fullName: string;
  roleTitle?: string | null;
  contact?: string | null;
  status: StaffStatus;
  createdAt: string;
  updatedAt: string;
  totalLogsCount?: number;
  latestLog?: ProjectStaffWorkLog | null;
}

export interface CreateStaffMemberPayload {
  staffNumber: string;
  fullName: string;
  roleTitle?: string;
  contact?: string;
  projectId?: string;
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
