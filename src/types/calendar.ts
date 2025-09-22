/**
 * Google Calendar API types and interfaces for Phase 3B
 */

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string; // ISO 8601 format
    timeZone?: string;
  };
  end: {
    dateTime: string; // ISO 8601 format
    timeZone?: string;
  };
  location?: string;
  attendees?: Array<{
    email: string;
    displayName?: string;
  }>;
  colorId?: string;
  transparency?: 'opaque' | 'transparent';
  visibility?: 'default' | 'public' | 'private';
}

export interface CalendarEventRequest {
  summary: string;
  description?: string | undefined;
  startDateTime: string; // ISO 8601 format
  endDateTime: string; // ISO 8601 format
  timeZone?: string | undefined;
  location?: string | undefined;
  attendeeEmails?: string[] | undefined;
  colorId?: string | undefined;
}

export interface CalendarCreationResult {
  success: boolean;
  event?: CalendarEvent;
  error?: string;
  eventId?: string;
  htmlLink?: string;
  calendarId?: string;
}

export interface BatchCalendarCreationResult {
  totalEvents: number;
  successfulEvents: CalendarEvent[];
  failedEvents: Array<{
    event: CalendarEventRequest;
    error: string;
  }>;
  success: boolean;
  summary: {
    created: number;
    failed: number;
    totalAttempted: number;
  };
}

export interface CalendarConfig {
  calendarId?: string; // Default is 'primary'
  timeZone?: string; // Default is 'America/Los_Angeles'
  sendNotifications?: boolean;
  sendUpdates?: 'all' | 'externalOnly' | 'none';
  defaultEventDuration?: number; // Minutes for events without end time
  conflictDetection?: boolean;
  batchSize?: number; // Max events per batch operation
}

export interface CalendarListEntry {
  id: string;
  summary: string;
  description?: string;
  timeZone: string;
  accessRole: 'freeBusyReader' | 'reader' | 'writer' | 'owner';
  primary?: boolean;
  selected?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
}

export interface CalendarQuotaInfo {
  requestsPerDay: number;
  requestsPerMinute: number;
  currentUsage: {
    requestsToday: number;
    requestsThisMinute: number;
  };
  quotaExceeded: boolean;
}

export const DEFAULT_CALENDAR_CONFIG: CalendarConfig = {
  calendarId: 'primary',
  timeZone: 'America/Los_Angeles',
  sendNotifications: false,
  sendUpdates: 'none',
  defaultEventDuration: 60,
  conflictDetection: true,
  batchSize: 10
} as const;

export const CALENDAR_EVENT_COLORS = {
  WORK: '1',      // Blue
  MEETING: '2',   // Green  
  PERSONAL: '3',  // Purple
  DEADLINE: '4',  // Red
  TRAVEL: '5',    // Yellow
  HOLIDAY: '6',   // Orange
  BIRTHDAY: '7',  // Turquoise
  OTHER: '8'      // Gray
} as const;

export type CalendarEventColor = keyof typeof CALENDAR_EVENT_COLORS;