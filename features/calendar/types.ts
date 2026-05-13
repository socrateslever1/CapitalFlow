
export type CalendarViewMode = 'DAY' | 'WEEK' | 'MONTH' | 'LIST';

export type EventType = 'TASK' | 'MEETING' | 'REMINDER' | 'SYSTEM_LOAN_START' | 'SYSTEM_INSTALLMENT' | 'SYSTEM_PORTAL_REQUEST';
export type EventPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type EventStatus = 'PENDING' | 'DONE' | 'LATE' | 'PAID' | 'PARTIAL' | 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'UPCOMING';

export interface CalendarEvent {
  id: string;
  profile_id?: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  type: EventType;
  status: EventStatus;
  priority: EventPriority;
  recurrence?: 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  
  meta?: {
      loanId?: string;
      installmentId?: string;
      clientId?: string;
      amount?: number;
      signalId?: string;
      intentId?: string;
      comprovanteUrl?: string;
      clientName?: string;
      clientPhone?: string;
  };
  
  google_event_id?: string;
  color?: string;
  clientName?: string;
}

export interface GoogleIntegration {
  profile_id: string;
  google_access_token?: string;
  sync_enabled: boolean;
  last_sync_at?: string;
}
