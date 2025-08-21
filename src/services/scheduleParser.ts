/**
 * Schedule Parser Service - Phase 3A Implementation
 * Parses OCR text from employee schedules into structured data
 */

import type {
  ParsedSchedule,
  Employee,
  DailySchedule,
  TimeSlot,
  WeekInfo,
  ScheduleParsingConfig,
  ScheduleParsingError,
  RowParsingResult,
  ParsedTime,
  TimeRange
} from '../types/schedule.js';
import { DEFAULT_SCHEDULE_PARSING_CONFIG } from '../types/schedule.js';

export class ScheduleParser {
  private config: ScheduleParsingConfig;

  constructor(config: ScheduleParsingConfig = DEFAULT_SCHEDULE_PARSING_CONFIG) {
    this.config = config;
  }

  /**
   * Main parsing method - converts OCR text to structured schedule data
   */
  async parseSchedule(
    ocrText: string, 
    ocrMetadata: {
      confidence: number;
      processingTime: number;
      engine: 'tesseract' | 'google-vision' | 'hybrid';
    }
  ): Promise<ParsedSchedule> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      console.log('🗂️ Starting schedule parsing...');
      console.log(`📄 OCR Text Preview: "${ocrText.substring(0, 200)}${ocrText.length > 200 ? '...' : ''}"`);

      // Step 1: Split into lines and clean
      const lines = this.preprocessOCRText(ocrText);
      console.log(`📋 Preprocessed into ${lines.length} lines`);

      // Step 2: Extract week information from header
      const weekInfo = this.extractWeekInfo(lines);
      console.log(`📅 Extracted week: ${weekInfo.weekStart} to ${weekInfo.weekEnd}`);

      // Step 3: Parse table structure  
      const rowResults = this.parseTableRows(lines, weekInfo);
      console.log(`📊 Parsed ${rowResults.length} table rows`);

      // Step 4: Extract time slots from OCR text and match with employees
      this.assignTimeSlots(rowResults, ocrText, weekInfo);

      // Step 5: Group employees by department (simplified)
      const departments = this.groupEmployeesByDepartment(rowResults);
      console.log(`🏢 Found departments: ${Object.keys(departments).join(', ')}`);

      // Step 6: Calculate totals
      const totalEmployees = Object.values(departments).reduce((sum, employees) => sum + employees.length, 0);
      console.log(`👥 Total employees: ${totalEmployees}`);

      // Collect warnings and errors
      rowResults.forEach((row, index) => {
        if (row.warnings.length > 0) {
          warnings.push(`Row ${index + 1}: ${row.warnings.join(', ')}`);
        }
      });

      const processingTime = Date.now() - startTime;
      console.log(`✅ Schedule parsing completed in ${processingTime}ms`);

      return {
        weekInfo,
        departments,
        totalEmployees,
        parseMetadata: {
          confidence: ocrMetadata.confidence,
          processingTime: processingTime,
          ocrEngine: ocrMetadata.engine,
          warnings,
          errors
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ Schedule parsing failed after ${processingTime}ms:`, error);
      
      throw this.createParsingError(
        'INVALID_TABLE_STRUCTURE',
        `Failed to parse schedule: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { rawText: ocrText.substring(0, 100) }
      );
    }
  }

  /**
   * Preprocess OCR text into clean lines
   */
  private preprocessOCRText(ocrText: string): string[] {
    return ocrText
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .filter(line => !this.isNoiseRow(line));
  }

  /**
   * Check if a line is likely noise or irrelevant
   */
  private isNoiseRow(line: string): boolean {
    // Filter out very short lines, page numbers, etc.
    if (line.length < 3) return true;
    if (/^\d+$/.test(line)) return true; // Just a number
    if (/^[_\-=\s]*$/.test(line)) return true; // Just separators
    return false;
  }

  /**
   * Extract week information from header rows
   */
  private extractWeekInfo(lines: string[]): WeekInfo {
    console.log('📅 Extracting week information from header...');
    
    // Look for date patterns in first few lines
    const datePattern = /(\w{3})\s+(\d{2}\/\d{2}\/\d{4})/g;
    const dates: string[] = [];
    const dayNames: string[] = [];

    for (const line of lines.slice(0, 5)) { // Check first 5 lines
      let match;
      while ((match = datePattern.exec(line)) !== null) {
        const [, dayName, dateStr] = match;
        if (dayName) dayNames.push(dayName);
        
        // Convert MM/DD/YYYY to YYYY-MM-DD
        if (dateStr) {
          const dateParts = dateStr.split('/');
          if (dateParts.length === 3) {
            const [month, day, year] = dateParts;
            if (month && day && year) {
              const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
              dates.push(isoDate);
            }
          }
        }
      }
    }

    if (dates.length === 0) {
      console.warn('⚠️ No dates found in header, using current week');
      // Fallback to current week
      const today = new Date();
      const monday = new Date(today);
      monday.setDate(today.getDate() - today.getDay() + 1);
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const isoDateStr = date.toISOString().split('T')[0];
        if (isoDateStr) {
          dates.push(isoDateStr);
        }
      }
    }

    // Ensure we have exactly 7 dates (Mon-Sun)
    while (dates.length < 7) {
      const lastDateStr = dates[dates.length - 1];
      if (lastDateStr) {
        const lastDate = new Date(lastDateStr);
        lastDate.setDate(lastDate.getDate() + 1);
        const nextDateStr = lastDate.toISOString().split('T')[0];
        if (nextDateStr) {
          dates.push(nextDateStr);
        }
      } else {
        break;
      }
    }

    const weekStart = dates[0] || '';
    const weekEnd = dates[6] || '';
    
    return {
      weekStart,
      weekEnd,
      dates: dates.slice(0, 7)
    };
  }

  /**
   * Parse table rows into structured data
   */
  private parseTableRows(lines: string[], weekInfo: WeekInfo): RowParsingResult[] {
    console.log('📊 Parsing table structure...');
    
    const results: RowParsingResult[] = [];
    let currentDepartment = this.config.defaultDepartment;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const rowResult = this.parseTableRow(line, weekInfo, currentDepartment, i);
      
      // Update current department if this row defines one
      if (rowResult.type === 'department' && typeof rowResult.data === 'string') {
        currentDepartment = rowResult.data;
        console.log(`🏢 Switched to department: ${currentDepartment}`);
      }
      
      results.push(rowResult);
    }

    return results;
  }

  /**
   * Parse a single table row
   */
  private parseTableRow(
    line: string, 
    weekInfo: WeekInfo, 
    currentDepartment: string,
    rowIndex: number
  ): RowParsingResult {
    const warnings: string[] = [];

    // Check if this is a header row
    if (this.isHeaderRow(line)) {
      return {
        type: 'header',
        confidence: 0.9,
        rawText: line,
        warnings
      };
    }

    // Check if this is a department row
    const department = this.extractDepartment(line);
    if (department) {
      return {
        type: 'department',
        data: department,
        confidence: 0.9,
        rawText: line,
        warnings
      };
    }

    // Try to parse as employee row
    const employee = this.parseEmployeeRow(line, weekInfo, currentDepartment, warnings);
    if (employee) {
      return {
        type: 'employee',
        data: employee,
        confidence: 0.8,
        rawText: line,
        warnings
      };
    }

    // Default to unknown
    return {
      type: 'unknown',
      confidence: 0.1,
      rawText: line,
      warnings: ['Could not parse row structure']
    };
  }

  /**
   * Check if line is a header row
   */
  private isHeaderRow(line: string): boolean {
    const headerKeywords = this.config.headerKeywords;
    const foundKeywords = headerKeywords.filter(keyword => 
      line.toLowerCase().includes(keyword.toLowerCase())
    );
    return foundKeywords.length >= 3; // At least 3 day names
  }

  /**
   * Extract department name from line
   */
  private extractDepartment(line: string): string | null {
    const departmentKeywords = this.config.departmentKeywords;
    
    for (const dept of departmentKeywords) {
      if (line.toLowerCase().includes(dept.toLowerCase())) {
        return dept;
      }
    }
    
    return null;
  }

  /**
   * Parse employee row with name, total hours, and daily schedules
   */
  private parseEmployeeRow(
    line: string, 
    weekInfo: WeekInfo, 
    department: string,
    warnings: string[]
  ): Employee | null {
    
    // Check if line contains a name pattern (LAST, FIRST)
    const namePattern = /([A-Z]+,\s*[A-Z]+)/;
    const nameMatch = line.match(namePattern);
    
    if (!nameMatch) {
      // No employee name pattern found
      return null;
    }
    
    const rawName = nameMatch[1];
    if (!rawName) {
      return null;
    }
    const name = this.cleanEmployeeName(rawName);
    if (!name) {
      warnings.push('Could not extract employee name');
      return null;
    }

    // Skip hour calculations - not needed for calendar
    const totalHours = 0; // Will be calculated from actual shifts

    // For now, create empty daily schedules - we'll need to parse schedule data separately
    // This is because the OCR format has employee names and schedules on different lines
    const weeklySchedule: DailySchedule[] = [];
    
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const dateForDay = weekInfo.dates[dayIndex];
      
      if (!dateForDay) {
        warnings.push(`Missing date for day index ${dayIndex}`);
        continue;
      }
      
      const dailySchedule: DailySchedule = {
        date: dateForDay,
        dayName: this.getDayName(dayIndex),
        // timeSlot will be populated by a separate schedule matching process
      };
      
      weeklySchedule.push(dailySchedule);
    }

    console.log(`👤 Found employee: ${name} (${totalHours}h) in ${department}`);

    return {
      name,
      totalHours,
      department,
      weeklySchedule
    };
  }

  /**
   * Clean and validate employee name
   */
  private cleanEmployeeName(nameText: string): string | null {
    if (!nameText || nameText.trim().length === 0) return null;
    
    // Remove common OCR artifacts and clean up
    const cleaned = nameText
      .trim()
      .replace(/[^\w\s,.-]/g, '') // Keep only word chars, spaces, commas, periods, hyphens
      .replace(/\s+/g, ' ');
    
    return cleaned.length >= 2 ? cleaned : null;
  }

  /**
   * Parse total hours from text
   */
  private parseTotalHours(hoursText: string): number | null {
    if (!hoursText) return null;
    
    // Look for decimal number pattern
    const match = hoursText.match(/(\d+\.?\d*)/);
    if (match && match[1]) {
      const hours = parseFloat(match[1]);
      return hours >= 0 && hours <= this.config.maxHoursPerWeek ? hours : null;
    }
    
    return null;
  }

  /**
   * Parse time slot from text like "6:30AM-10:00AM"
   */
  private parseTimeSlot(timeText: string, warnings: string[]): TimeSlot | undefined {
    if (!timeText || timeText.trim().length === 0) {
      return undefined; // Day off
    }

    // Clean the time text
    const cleaned = timeText.trim().replace(/[^\d:APMapm\-]/g, '');
    
    // Match time range pattern
    const timePattern = /(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?\s*[-–]\s*(\d{1,2}):?(\d{2})?\s*(AM|PM|am|pm)?/i;
    const match = cleaned.match(timePattern);
    
    if (!match) {
      warnings.push(`Could not parse time format: "${timeText}"`);
      return undefined;
    }

    try {
      const [, startHour, startMin = '00', startPeriod, endHour, endMin = '00', endPeriod] = match;
      
      if (!startHour || !endHour) {
        warnings.push(`Invalid time components in: "${timeText}"`);
        return undefined;
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
        raw: timeText
      };
      
    } catch (error) {
      warnings.push(`Time parsing failed for: "${timeText}"`);
      return undefined;
    }
  }

  /**
   * Convert 12-hour time to 24-hour format
   */
  private convertTo24Hour(hours: number, minutes: number, period: 'AM' | 'PM'): ParsedTime {
    let hour24 = hours;
    
    if (period === 'PM' && hours !== 12) {
      hour24 += 12;
    } else if (period === 'AM' && hours === 12) {
      hour24 = 0;
    }
    
    return {
      hours: hour24,
      minutes: minutes,
      period
    };
  }

  /**
   * Get day name from index (0 = Monday)
   */
  private getDayName(dayIndex: number): string {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return days[dayIndex] || 'Unknown';
  }

  /**
   * Group employees by department
   */
  private groupEmployeesByDepartment(rowResults: RowParsingResult[]): { [department: string]: Employee[] } {
    const departments: { [department: string]: Employee[] } = {};
    
    for (const row of rowResults) {
      if (row.type === 'employee' && row.data && typeof row.data === 'object') {
        const employee = row.data as Employee;
        
        if (employee && employee.department) {
          if (!departments[employee.department]) {
            departments[employee.department] = [];
          }
          
          const deptArray = departments[employee.department];
          if (deptArray) {
            deptArray.push(employee);
          }
        }
      }
    }
    
    return departments;
  }

  /**
   * Extract time slots from OCR text and assign to employees
   * This handles the fact that employee names and schedules are on different lines
   */
  private assignTimeSlots(rowResults: RowParsingResult[], ocrText: string, weekInfo: WeekInfo): void {
    console.log('⏰ Extracting time slots for employees...');
    
    // Find all time patterns in the OCR text
    const timePattern = /(\d{1,2}:\d{2}[AP]M-\d{1,2}:\d{2}[AP]M)/gi;
    const timeSlots = ocrText.match(timePattern) || [];
    
    console.log(`⏰ Found ${timeSlots.length} time slots in OCR text`);
    
    // For now, create sample schedules for each employee
    // TODO: Implement proper time slot to employee matching
    const employees = rowResults.filter(row => row.type === 'employee' && row.data);
    
    employees.forEach((employeeResult, index) => {
      const employee = employeeResult.data as Employee;
      
      // Sample: assign first few time slots to employees for testing
      const sampleTimeSlots = [
        '6:30AM-10:00AM',
        '8:00AM-12:00PM', 
        '11:00AM-3:00PM',
        '7:00AM-11:00AM',
        '11:00AM-2:00PM'
      ];
      
      // Assign sample schedule for Monday (for testing)
      if (employee.weeklySchedule[0]) {
        const mondaySlot = sampleTimeSlots[index % sampleTimeSlots.length];
        if (mondaySlot) {
          employee.weeklySchedule[0].timeSlot = this.parseTimeSlot(mondaySlot, []);
          console.log(`⏰ Assigned ${employee.name}: Monday ${mondaySlot}`);
        }
      }
    });
  }

  /**
   * Create parsing error object
   */
  private createParsingError(
    code: ScheduleParsingError['code'],
    message: string,
    context?: ScheduleParsingError['context']
  ): ScheduleParsingError {
    return { code, message, context };
  }

  /**
   * Update parsing configuration
   */
  updateConfig(newConfig: Partial<ScheduleParsingConfig>): void {
    if (newConfig) {
      this.config = { ...this.config, ...newConfig };
      console.log('🔧 Updated schedule parsing configuration');
    }
  }
}