export interface GymSchedule {
  regularHours: {
    weekdays: DayHours;
    saturday: DayHours;
    sunday: DayHours;
  };
  closures: Closure[];
  modifiedHours: ModifiedHours[];
  notices: string[];
  parseConfidence: 'high' | 'medium' | 'low';
  siteUnavailable: boolean;
  lastChecked: string;   // ISO datetime
  lastChanged: string;   // ISO datetime
}

export interface DayHours {
  open: string;  // "HH:MM"
  close: string; // "HH:MM"
}

export interface Closure {
  dateFrom: string;      // "YYYY-MM-DD"
  dateTo: string;        // "YYYY-MM-DD"
  timeFrom: string | null;
  timeTo: string | null;
  reason: string;
  affectsWholeBuilding: boolean;
}

export interface ModifiedHours {
  dateFrom: string;
  dateTo: string;
  open: string;
  close: string;
  reason: string;
}

export interface NoDataResponse {
  status: 'no-data';
  message: string;
}

export type ScheduleResponse = GymSchedule | NoDataResponse;
