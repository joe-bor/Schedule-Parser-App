/**
 * Schedule parsing types and interfaces for Phase 3A
 * Based on actual employee schedule format analysis
 */

export interface TimeSlot {
  start: string; // HH:MM format (24-hour)
  end: string;   // HH:MM format (24-hour)
  raw: string;   // Original text like "6:30AM-10:00AM"
}

export interface DailySchedule {
  date: string;        // YYYY-MM-DD format
  dayName: string;     // "Monday", "Tuesday", etc.
  timeSlot?: TimeSlot | undefined; // undefined if day off
  additionalShifts?: TimeSlot[]; // For split shifts (multiple time ranges per day)
  notes?: string;      // Additional info like "Meat Cutter"
}

export interface Employee {
  name: string;                    // Full name from schedule
  totalHours: number;              // Weekly total hours
  department: string;              // "Meat", "Produce", etc.
  weeklySchedule: DailySchedule[]; // 7 days starting from Monday
}

export interface WeekInfo {
  weekStart: string; // YYYY-MM-DD format (Monday)
  weekEnd: string;   // YYYY-MM-DD format (Sunday)
  dates: string[];   // Array of 7 dates in YYYY-MM-DD format
}

export interface ParsedSchedule {
  weekInfo: WeekInfo;
  departments: {
    [departmentName: string]: Employee[];
  };
  totalEmployees: number;
  parseMetadata: {
    confidence: number;           // OCR confidence score
    processingTime: number;       // Total parsing time in ms
    ocrEngine: 'tesseract' | 'google-vision' | 'hybrid';
    warnings: string[];           // Parsing warnings
    errors: string[];             // Parsing errors
  };
}

/**
 * Schedule parsing configuration
 */
export interface ScheduleParsingConfig {
  // Time parsing options
  timeFormat: '12h' | '24h';
  defaultDepartment: string;
  
  // Validation thresholds
  minConfidenceThreshold: number;
  maxHoursPerDay: number;
  maxHoursPerWeek: number;
  
  // Table structure detection
  expectedColumns: number; // Should be 9: Name, Total, Mon-Sun
  headerKeywords: string[]; // Words to identify header row
  departmentKeywords: string[]; // Words to identify department sections
  
  // Error handling
  strictValidation: boolean;
  skipInvalidEntries: boolean;
}

export const DEFAULT_SCHEDULE_PARSING_CONFIG: ScheduleParsingConfig = {
  timeFormat: '24h',
  defaultDepartment: 'Unknown',
  minConfidenceThreshold: 0.7,
  maxHoursPerDay: 16,
  maxHoursPerWeek: 80,
  expectedColumns: 9,
  headerKeywords: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Total'],
  departmentKeywords: ['Meat', 'Produce', 'Deli', 'Bakery'],
  strictValidation: false,
  skipInvalidEntries: true
} as const;

/**
 * Parsing result for individual table rows
 */
export interface RowParsingResult {
  type: 'header' | 'department' | 'employee' | 'empty' | 'unknown';
  data?: Employee | string; // Employee data or department name
  confidence: number;
  rawText: string;
  warnings: string[];
}

/**
 * Error types for schedule parsing
 */
export interface ScheduleParsingError {
  code: 
    | 'INVALID_TABLE_STRUCTURE' 
    | 'INVALID_TIME_FORMAT' 
    | 'INVALID_DATE_FORMAT'
    | 'MISSING_EMPLOYEE_NAME'
    | 'INVALID_TOTAL_HOURS'
    | 'TIME_VALIDATION_FAILED'
    | 'DEPARTMENT_NOT_FOUND'
    | 'OCR_CONFIDENCE_TOO_LOW';
  message: string;
  context?: {
    rowIndex?: number;
    columnIndex?: number;
    rawText?: string;
    expectedFormat?: string;
  } | undefined;
}

/**
 * Time parsing utilities types
 */
export interface ParsedTime {
  hours: number;   // 0-23
  minutes: number; // 0-59
  period?: 'AM' | 'PM'; // For display purposes
}

export interface TimeRange {
  start: ParsedTime;
  end: ParsedTime;
  durationMinutes: number;
  isValidRange: boolean;
}