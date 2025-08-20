/**
 * Schedule validation utilities for Phase 3A
 * Validates parsed schedule data for consistency and business rules
 */

import type {
  ParsedSchedule,
  Employee,
  DailySchedule,
  TimeSlot,
  ScheduleParsingConfig,
  ScheduleParsingError
} from '../types/schedule.js';

export interface ValidationResult {
  isValid: boolean;
  errors: ScheduleParsingError[];
  warnings: string[];
  fixedIssues: string[];
}

export class ScheduleValidator {
  private config: ScheduleParsingConfig;

  constructor(config: ScheduleParsingConfig) {
    this.config = config;
  }

  /**
   * Comprehensive validation of parsed schedule
   */
  validateSchedule(schedule: ParsedSchedule): ValidationResult {
    console.log('🔍 Starting schedule validation...');
    
    const errors: ScheduleParsingError[] = [];
    const warnings: string[] = [];
    const fixedIssues: string[] = [];

    // Validate overall confidence
    this.validateOCRConfidence(schedule, errors);
    
    // Validate week info
    this.validateWeekInfo(schedule.weekInfo, errors, warnings);

    // Validate each department and employee
    for (const [deptName, employees] of Object.entries(schedule.departments)) {
      this.validateDepartment(deptName, employees, errors, warnings, fixedIssues);
    }

    // Check for empty departments
    if (schedule.totalEmployees === 0) {
      errors.push({
        code: 'INVALID_TABLE_STRUCTURE',
        message: 'No employees found in schedule',
        context: { rawText: 'Empty schedule' }
      });
    }

    const isValid = errors.length === 0;
    console.log(`${isValid ? '✅' : '❌'} Validation completed: ${errors.length} errors, ${warnings.length} warnings`);

    return { isValid, errors, warnings, fixedIssues };
  }

  /**
   * Validate OCR confidence threshold
   */
  private validateOCRConfidence(schedule: ParsedSchedule, errors: ScheduleParsingError[]): void {
    if (schedule.parseMetadata.confidence < this.config.minConfidenceThreshold) {
      errors.push({
        code: 'OCR_CONFIDENCE_TOO_LOW',
        message: `OCR confidence ${(schedule.parseMetadata.confidence * 100).toFixed(1)}% below threshold ${(this.config.minConfidenceThreshold * 100).toFixed(1)}%`,
        context: {
          rawText: `Confidence: ${schedule.parseMetadata.confidence}`
        }
      });
    }
  }

  /**
   * Validate week information
   */
  private validateWeekInfo(weekInfo: any, errors: ScheduleParsingError[], warnings: string[]): void {
    if (!weekInfo.weekStart || !weekInfo.weekEnd) {
      errors.push({
        code: 'INVALID_DATE_FORMAT',
        message: 'Missing week start or end date',
        context: { rawText: JSON.stringify(weekInfo) }
      });
      return;
    }

    if (weekInfo.dates.length !== 7) {
      warnings.push(`Expected 7 dates, found ${weekInfo.dates.length}`);
    }

    // Validate date format (YYYY-MM-DD)
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    for (const date of weekInfo.dates) {
      if (!datePattern.test(date)) {
        errors.push({
          code: 'INVALID_DATE_FORMAT',
          message: `Invalid date format: ${date}`,
          context: { expectedFormat: 'YYYY-MM-DD', rawText: date }
        });
      }
    }
  }

  /**
   * Validate department and all its employees
   */
  private validateDepartment(
    deptName: string,
    employees: Employee[],
    errors: ScheduleParsingError[],
    warnings: string[],
    fixedIssues: string[]
  ): void {
    if (employees.length === 0) {
      warnings.push(`Department '${deptName}' has no employees`);
      return;
    }

    console.log(`🏢 Validating ${deptName} department: ${employees.length} employees`);

    for (let i = 0; i < employees.length; i++) {
      const employee = employees[i];
      if (employee) {
        this.validateEmployee(employee, i, deptName, errors, warnings, fixedIssues);
      }
    }
  }

  /**
   * Validate individual employee data
   */
  private validateEmployee(
    employee: Employee,
    index: number,
    department: string,
    errors: ScheduleParsingError[],
    warnings: string[],
    fixedIssues: string[]
  ): void {
    const context = { rowIndex: index, rawText: `${employee.name} - ${department}` };

    // Validate employee name
    if (!employee.name || employee.name.trim().length === 0) {
      errors.push({
        code: 'MISSING_EMPLOYEE_NAME',
        message: `Employee at index ${index} has no name`,
        context
      });
      return; // Can't validate further without a name
    }

    // Skip total hours validation - not needed for calendar integration

    // Validate weekly schedule
    if (employee.weeklySchedule.length !== 7) {
      warnings.push(`Employee ${employee.name} has ${employee.weeklySchedule.length} days instead of 7`);
    }

    // Skip hour validation - not needed for calendar integration
    // Just validate that we have valid time slots for calendar events
    let workDays = 0;
    for (let dayIndex = 0; dayIndex < employee.weeklySchedule.length; dayIndex++) {
      const dailySchedule = employee.weeklySchedule[dayIndex];
      if (dailySchedule && dailySchedule.timeSlot) {
        workDays++;
      }
    }
    
    if (workDays === 0) {
      warnings.push(`Employee ${employee.name} has no scheduled work days`);
    }
  }

  /**
   * Validate daily schedule entry
   */
  private validateDailySchedule(
    dailySchedule: DailySchedule,
    employeeName: string,
    dayIndex: number,
    errors: ScheduleParsingError[],
    warnings: string[]
  ): { hoursWorked: number } {
    const dayName = dailySchedule.dayName;
    let hoursWorked = 0;

    // If no time slot, it's a day off
    if (!dailySchedule.timeSlot) {
      return { hoursWorked: 0 };
    }

    const timeSlot = dailySchedule.timeSlot;
    
    // Validate time format
    const timePattern = /^([01]?\d|2[0-3]):([0-5]\d)$/;
    if (!timePattern.test(timeSlot.start) || !timePattern.test(timeSlot.end)) {
      errors.push({
        code: 'INVALID_TIME_FORMAT',
        message: `Employee ${employeeName} has invalid time format on ${dayName}: ${timeSlot.start}-${timeSlot.end}`,
        context: {
          rowIndex: dayIndex,
          expectedFormat: 'HH:MM (24-hour)',
          rawText: timeSlot.raw
        }
      });
      return { hoursWorked: 0 };
    }

    // Calculate hours worked
    const startMinutes = this.timeToMinutes(timeSlot.start);
    const endMinutes = this.timeToMinutes(timeSlot.end);
    
    if (endMinutes <= startMinutes) {
      warnings.push(`Employee ${employeeName} on ${dayName}: end time (${timeSlot.end}) is not after start time (${timeSlot.start})`);
      return { hoursWorked: 0 };
    }

    hoursWorked = (endMinutes - startMinutes) / 60;

    // Validate reasonable working hours per day
    if (hoursWorked > this.config.maxHoursPerDay) {
      warnings.push(`Employee ${employeeName} on ${dayName}: working ${hoursWorked.toFixed(1)} hours exceeds daily limit`);
    }

    return { hoursWorked };
  }

  /**
   * Convert HH:MM time to minutes since midnight
   */
  private timeToMinutes(timeStr: string): number {
    const parts = timeStr.split(':');
    const hours = parts[0] ? parseInt(parts[0]) : 0;
    const minutes = parts[1] ? parseInt(parts[1]) : 0;
    return hours * 60 + minutes;
  }

  /**
   * Attempt to fix common parsing issues
   */
  fixCommonIssues(schedule: ParsedSchedule): { fixed: ParsedSchedule; changes: string[] } {
    console.log('🔧 Attempting to fix common parsing issues...');
    
    const changes: string[] = [];
    const fixedSchedule = JSON.parse(JSON.stringify(schedule)); // Deep copy

    // Fix employee names
    for (const [deptName, employees] of Object.entries(fixedSchedule.departments)) {
      const employeeArray = employees as Employee[];
      for (const employee of employeeArray) {
        // Clean up common OCR artifacts in names
        const originalName = employee.name;
        employee.name = this.cleanEmployeeName(employee.name);
        
        if (employee.name !== originalName) {
          changes.push(`Fixed employee name: "${originalName}" → "${employee.name}"`);
        }

        // Fix common time parsing issues
        for (const day of employee.weeklySchedule) {
          if (day.timeSlot) {
            const originalRaw = day.timeSlot.raw;
            const fixed = this.fixTimeSlot(day.timeSlot);
            
            if (fixed && (fixed.start !== day.timeSlot.start || fixed.end !== day.timeSlot.end)) {
              day.timeSlot = fixed;
              changes.push(`Fixed time slot for ${employee.name}: "${originalRaw}" → "${fixed.start}-${fixed.end}"`);
            }
          }
        }
      }
    }

    console.log(`🔧 Applied ${changes.length} fixes to schedule data`);
    return { fixed: fixedSchedule, changes };
  }

  /**
   * Clean employee name from common OCR artifacts
   */
  private cleanEmployeeName(name: string): string {
    return name
      .replace(/[|]/g, 'I') // Common OCR mistake: | instead of I
      .replace(/[0]/g, 'O') // Common OCR mistake: 0 instead of O
      .replace(/[5]/g, 'S') // Common OCR mistake: 5 instead of S
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Attempt to fix time slot parsing issues
   */
  private fixTimeSlot(timeSlot: TimeSlot): TimeSlot | null {
    // Try to fix common issues with time parsing
    let raw = timeSlot.raw;
    
    // Fix common OCR mistakes
    raw = raw.replace(/[|]/g, '1'); // | mistaken for 1
    raw = raw.replace(/[O]/g, '0'); // O mistaken for 0
    raw = raw.replace(/\s+/g, ''); // Remove extra spaces
    
    // Re-parse the cleaned raw text
    const timePattern = /(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?\s*[-–]\s*(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?/i;
    const match = raw.match(timePattern);
    
    if (!match) return null;

    try {
      const [, startHour, startMin = '00', startPeriod, endHour, endMin = '00', endPeriod] = match;
      
      if (!startHour || !endHour) {
        return null;
      }
      
      const start = this.convertTo24Hour(
        parseInt(startHour), 
        parseInt(startMin), 
        (startPeriod || endPeriod || 'AM').toUpperCase() as 'AM' | 'PM'
      );
      
      const end = this.convertTo24Hour(
        parseInt(endHour), 
        parseInt(endMin), 
        (endPeriod || startPeriod || 'PM').toUpperCase() as 'AM' | 'PM'
      );

      return {
        start: `${start.hours.toString().padStart(2, '0')}:${start.minutes.toString().padStart(2, '0')}`,
        end: `${end.hours.toString().padStart(2, '0')}:${end.minutes.toString().padStart(2, '0')}`,
        raw: timeSlot.raw // Keep original raw text
      };
      
    } catch {
      return null;
    }
  }

  /**
   * Convert 12-hour time to 24-hour format
   */
  private convertTo24Hour(hours: number, minutes: number, period: 'AM' | 'PM'): { hours: number; minutes: number } {
    let hour24 = hours;
    
    if (period === 'PM' && hours !== 12) {
      hour24 += 12;
    } else if (period === 'AM' && hours === 12) {
      hour24 = 0;
    }
    
    return { hours: hour24, minutes };
  }
}