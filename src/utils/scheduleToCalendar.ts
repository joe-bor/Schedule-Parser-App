/**
 * Utility to convert parsed schedule data to Google Calendar events
 */

import type { CalendarEventRequest } from '../types/calendar.js';
import { CALENDAR_EVENT_COLORS } from '../types/calendar.js';
import { validateEnv } from '../config/env.js';

// Import schedule types from Phase 3A
// Note: These will be available when we merge Phase 3A
interface TimeSlot {
  start: string; // HH:MM format (24-hour)
  end: string;   // HH:MM format (24-hour)
  raw: string;   // Original text like "6:30AM-10:00AM"
}

interface DailySchedule {
  date: string;        // YYYY-MM-DD format
  dayName: string;     // "Monday", "Tuesday", etc.
  timeSlot?: TimeSlot | undefined; // undefined if day off
  additionalShifts?: TimeSlot[]; // For split shifts (multiple time ranges per day)
  notes?: string;      // Additional info like "Meat Cutter"
}

interface Employee {
  name: string;                    // Full name from schedule
  totalHours: number;              // Weekly total hours
  department: string;              // "Meat", "Produce", etc.
  weeklySchedule: DailySchedule[]; // 7 days starting from Monday
}

interface WeekInfo {
  weekStart: string; // YYYY-MM-DD format (Monday)
  weekEnd: string;   // YYYY-MM-DD format (Sunday)
  dates: string[];   // Array of 7 dates in YYYY-MM-DD format
}

interface ParsedSchedule {
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

export interface ScheduleToCalendarOptions {
  timeZone?: string;
  includeAllEmployees?: boolean;
  selectedEmployees?: string[]; // Employee names to include
  selectedDepartments?: string[]; // Departments to include
  eventColorByDepartment?: boolean;
  includeEmployeeInTitle?: boolean;
  includeDepartmentInTitle?: boolean;
  eventPrefix?: string; // Prefix for all events (e.g., "Work - ")
  location?: string; // Default location for all events
  reminderMinutes?: number;
  privateEvents?: boolean;
}

export interface ConversionResult {
  success: boolean;
  events: CalendarEventRequest[];
  summary: {
    totalEmployees: number;
    totalShifts: number;
    departments: string[];
    dateRange: {
      start: string;
      end: string;
    };
  };
  warnings: string[];
  errors: string[];
}

export const DEFAULT_CONVERSION_OPTIONS: ScheduleToCalendarOptions = {
  timeZone: 'America/Los_Angeles',
  includeAllEmployees: true,
  selectedEmployees: [],
  selectedDepartments: [],
  eventColorByDepartment: true,
  includeEmployeeInTitle: true,
  includeDepartmentInTitle: false,
  eventPrefix: '',
  location: '',
  reminderMinutes: 15,
  privateEvents: false
};

export const PERSONAL_CONVERSION_OPTIONS: ScheduleToCalendarOptions = {
  timeZone: 'America/Los_Angeles',
  includeAllEmployees: false,
  selectedEmployees: ['Joezari Borlongan', 'BORLONGAN, JOEZARI'], // Handle both name formats
  selectedDepartments: [],
  eventColorByDepartment: true,
  includeEmployeeInTitle: false, // Don't need your name in title since it's your calendar
  includeDepartmentInTitle: true, // Show department in title instead
  eventPrefix: 'Work - ',
  location: '',
  reminderMinutes: 15,
  privateEvents: false
};

export class ScheduleToCalendarConverter {
  private options: ScheduleToCalendarOptions;

  constructor(options?: Partial<ScheduleToCalendarOptions>) {
    const env = validateEnv();
    this.options = {
      ...DEFAULT_CONVERSION_OPTIONS,
      timeZone: env.CALENDAR_DEFAULT_TIMEZONE,
      ...options
    };
  }

  /**
   * Create a converter specifically for personal schedules (Joezari Borlongan only)
   */
  static createPersonalConverter(): ScheduleToCalendarConverter {
    return new ScheduleToCalendarConverter(PERSONAL_CONVERSION_OPTIONS);
  }

  /**
   * Convert parsed schedule to calendar events
   */
  convertSchedule(parsedSchedule: ParsedSchedule): ConversionResult {
    const result: ConversionResult = {
      success: false,
      events: [],
      summary: {
        totalEmployees: parsedSchedule.totalEmployees,
        totalShifts: 0,
        departments: Object.keys(parsedSchedule.departments),
        dateRange: {
          start: parsedSchedule.weekInfo.weekStart,
          end: parsedSchedule.weekInfo.weekEnd
        }
      },
      warnings: [],
      errors: []
    };

    try {
      // Process each department
      for (const [departmentName, employees] of Object.entries(parsedSchedule.departments)) {
        // Skip department if not selected
        if (this.options.selectedDepartments && 
            this.options.selectedDepartments.length > 0 && 
            !this.options.selectedDepartments.includes(departmentName)) {
          continue;
        }

        // Process each employee in the department
        for (const employee of employees) {
          // Skip employee if not selected
          if (!this.options.includeAllEmployees && 
              this.options.selectedEmployees && 
              !this.options.selectedEmployees.includes(employee.name)) {
            continue;
          }

          const employeeEvents = this.convertEmployeeSchedule(employee, departmentName);
          result.events.push(...employeeEvents);
          result.summary.totalShifts += employeeEvents.length;
        }
      }

      result.success = true;
      console.log(`✅ Converted ${result.summary.totalShifts} shifts to calendar events`);

    } catch (error) {
      console.error('❌ Schedule conversion failed:', error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown conversion error');
    }

    return result;
  }

  /**
   * Convert single employee's weekly schedule to calendar events
   */
  private convertEmployeeSchedule(employee: Employee, departmentName: string): CalendarEventRequest[] {
    const events: CalendarEventRequest[] = [];

    for (const dailySchedule of employee.weeklySchedule) {
      // Skip days without time slots (days off)
      if (!dailySchedule.timeSlot) {
        continue;
      }

      try {
        const event = this.createCalendarEvent(employee, dailySchedule, departmentName);
        events.push(event);
      } catch (error) {
        console.warn(`⚠️ Failed to create event for ${employee.name} on ${dailySchedule.dayName}:`, error);
      }
    }

    return events;
  }

  /**
   * Create a single calendar event from daily schedule
   * Combines all time segments (primary + additional shifts) into one full work day
   */
  private createCalendarEvent(
    employee: Employee,
    dailySchedule: DailySchedule,
    departmentName: string
  ): CalendarEventRequest {
    const primaryTimeSlot = dailySchedule.timeSlot!;

    // Combine all time segments to get the full work day span
    const allTimeSlots = [primaryTimeSlot];
    if (dailySchedule.additionalShifts) {
      allTimeSlots.push(...dailySchedule.additionalShifts);
    }

    // Find the earliest start time and latest end time for the full work day
    const { earliestStart, latestEnd, allSegments } = this.combineTimeSegments(allTimeSlots);

    // Create ISO 8601 datetime strings for the full work day
    const startDateTime = this.createDateTime(dailySchedule.date, earliestStart);
    const endDateTime = this.createDateTime(dailySchedule.date, latestEnd);

    // Log the exact datetime being used for calendar creation
    console.log(`📅 Creating calendar event: ${employee.name} | ${dailySchedule.dayName} ${dailySchedule.date} | ${startDateTime} to ${endDateTime}`);

    // Build event title
    let title = '';
    if (this.options.eventPrefix) {
      title += this.options.eventPrefix;
    }
    
    if (this.options.includeEmployeeInTitle) {
      title += employee.name;
    }
    
    if (this.options.includeDepartmentInTitle) {
      if (title) title += ' - ';
      title += departmentName;
    }
    
    if (!title) {
      title = `${employee.name} - Work Shift`;
    }

    // Build description with full work day details
    let description = `Employee: ${employee.name}\n`;
    description += `Department: ${departmentName}\n`;
    description += `Full Work Day: ${earliestStart} - ${latestEnd}\n`;
    
    if (allSegments.length > 1) {
      description += `Segments: ${allSegments}\n`;
    }
    
    description += `Weekly Total: ${employee.totalHours} hours`;
    
    if (dailySchedule.notes) {
      description += `\nNotes: ${dailySchedule.notes}`;
    }

    // Determine color based on department
    let colorId: string | undefined;
    if (this.options.eventColorByDepartment) {
      colorId = this.getDepartmentColor(departmentName);
    }

    const event: CalendarEventRequest = {
      summary: title,
      description: description,
      startDateTime: startDateTime,
      endDateTime: endDateTime,
      timeZone: this.options.timeZone || undefined,
      location: this.options.location || `${departmentName} Department`,
      colorId: colorId || undefined
    };

    return event;
  }

  /**
   * Combine multiple time segments into one full work day
   * Returns the earliest start time and latest end time
   */
  private combineTimeSegments(timeSlots: TimeSlot[]): {
    earliestStart: string;
    latestEnd: string;
    allSegments: string;
  } {
    let earliestStart = timeSlots[0].start;
    let latestEnd = timeSlots[0].end;
    const segments: string[] = [];
    
    for (const slot of timeSlots) {
      // Compare times (assuming HH:MM format)
      if (this.compareTime(slot.start, earliestStart) < 0) {
        earliestStart = slot.start;
      }
      
      if (this.compareTime(slot.end, latestEnd) > 0) {
        latestEnd = slot.end;
      }
      
      segments.push(`${slot.start}-${slot.end}`);
    }
    
    return {
      earliestStart,
      latestEnd,
      allSegments: segments.join(', ')
    };
  }

  /**
   * Compare two time strings in HH:MM format
   * Returns -1 if time1 < time2, 0 if equal, 1 if time1 > time2
   */
  private compareTime(time1: string, time2: string): number {
    const [hours1, minutes1] = time1.split(':').map(Number);
    const [hours2, minutes2] = time2.split(':').map(Number);
    
    const totalMinutes1 = hours1 * 60 + minutes1;
    const totalMinutes2 = hours2 * 60 + minutes2;
    
    return totalMinutes1 - totalMinutes2;
  }

  /**
   * Create ISO 8601 datetime string from date and time
   */
  private createDateTime(date: string, time: string): string {
    // date is in YYYY-MM-DD format
    // time is in HH:MM format (24-hour)
    return `${date}T${time}:00`;
  }

  /**
   * Get color ID for department
   */
  private getDepartmentColor(departmentName: string): string {
    const department = departmentName.toLowerCase();
    
    // Map departments to colors
    if (department.includes('meat')) {
      return CALENDAR_EVENT_COLORS.WORK; // Blue
    } else if (department.includes('produce')) {
      return CALENDAR_EVENT_COLORS.MEETING; // Green
    } else if (department.includes('deli')) {
      return CALENDAR_EVENT_COLORS.PERSONAL; // Purple
    } else if (department.includes('bakery')) {
      return CALENDAR_EVENT_COLORS.TRAVEL; // Yellow
    } else if (department.includes('dairy')) {
      return CALENDAR_EVENT_COLORS.HOLIDAY; // Orange
    } else {
      return CALENDAR_EVENT_COLORS.OTHER; // Gray
    }
  }

  /**
   * Convert single employee to calendar events (for testing/preview)
   */
  convertEmployee(employee: Employee, departmentName: string): CalendarEventRequest[] {
    return this.convertEmployeeSchedule(employee, departmentName);
  }

  /**
   * Generate preview summary of conversion
   */
  generatePreview(parsedSchedule: ParsedSchedule): {
    totalEvents: number;
    byDepartment: Record<string, number>;
    byEmployee: Record<string, number>;
    dateRange: string;
  } {
    const conversionResult = this.convertSchedule(parsedSchedule);
    
    const byDepartment: Record<string, number> = {};
    const byEmployee: Record<string, number> = {};

    // Count events by department and employee
    for (const [departmentName, employees] of Object.entries(parsedSchedule.departments)) {
      let departmentCount = 0;
      
      for (const employee of employees) {
        const employeeEventCount = employee.weeklySchedule.filter(day => day.timeSlot).length;
        byEmployee[employee.name] = employeeEventCount;
        departmentCount += employeeEventCount;
      }
      
      byDepartment[departmentName] = departmentCount;
    }

    return {
      totalEvents: conversionResult.summary.totalShifts,
      byDepartment,
      byEmployee,
      dateRange: `${parsedSchedule.weekInfo.weekStart} to ${parsedSchedule.weekInfo.weekEnd}`
    };
  }

  /**
   * Update conversion options
   */
  updateOptions(newOptions: Partial<ScheduleToCalendarOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * Get current options
   */
  getOptions(): ScheduleToCalendarOptions {
    return { ...this.options };
  }
}