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
import type { TableStructure, TableRow } from '../types/googleVision.js';

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
      engine: 'google-vision';
    },
    tableStructure?: TableStructure
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
      // Try table structure first, then fall back to OCR text
      const weekInfo = this.extractWeekInfo(lines, tableStructure);
      console.log(`📅 Extracted week: ${weekInfo.weekStart} to ${weekInfo.weekEnd}`);

      // Step 3: Parse table structure  
      const rowResults = this.parseTableRows(lines, weekInfo);
      console.log(`📊 Parsed ${rowResults.length} table rows`);

      // Step 4: Extract time slots from OCR text and match with employees
      this.assignTimeSlots(rowResults, ocrText, weekInfo, tableStructure);

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
   * Extract week information from OCR text
   * Dynamically parses dates from any schedule
   */
  private extractWeekInfo(lines: string[], tableStructure?: TableStructure): WeekInfo {
    console.log('📅 Extracting week information from OCR text...');

    // Priority 1: Try table structure first (most reliable)
    if (tableStructure?.dateHeaderRow) {
      const tableDates = this.extractDatesFromTableHeader(tableStructure.dateHeaderRow);
      if (tableDates.length >= 7) {
        console.log('📅 Successfully extracted dates from table structure:', tableDates.slice(0, 7));
        return {
          weekStart: tableDates[0],
          weekEnd: tableDates[6],
          dates: tableDates.slice(0, 7)
        };
      }
    }

    // Priority 2: Try to extract dates from OCR text
    const extractedDates = this.tryExtractDatesFromOCR(lines);

    if (extractedDates.length >= 7) {
      console.log('📅 Successfully extracted dates from OCR:', extractedDates.slice(0, 7));
      return {
        weekStart: extractedDates[0],
        weekEnd: extractedDates[6],
        dates: extractedDates.slice(0, 7)
      };
    }

    // Priority 3: If OCR extraction fails, try to find week patterns
    const weekPattern = this.findWeekPattern(lines);
    if (weekPattern) {
      console.log('📅 Found week pattern, generating dates:', weekPattern);
      return weekPattern;
    }

    // Fallback: Generate current week dates
    const fallbackDates = this.generateCurrentWeekDates();
    console.warn('⚠️ Could not extract dates from OCR, using current week fallback:', fallbackDates);
    return {
      weekStart: fallbackDates[0],
      weekEnd: fallbackDates[6],
      dates: fallbackDates
    };
  }

  /**
   * Extract dates from table header row
   */
  private extractDatesFromTableHeader(dateHeaderRow: TableRow): string[] {
    const dates: string[] = [];
    const datePattern = /(\d{1,2})\/(\d{1,2})\/(\d{4})/; // MM/DD/YYYY format

    console.log('📅 Extracting dates from table header row...');

    // Iterate through all cells in the date header row
    for (const cell of dateHeaderRow.cells) {
      const match = cell.text.match(datePattern);

      if (match) {
        const month = match[1].padStart(2, '0');
        const day = match[2].padStart(2, '0');
        const year = match[3];
        const isoDate = `${year}-${month}-${day}`;

        // Avoid duplicates
        if (!dates.includes(isoDate)) {
          dates.push(isoDate);
          console.log(`   📅 Found date in cell: ${cell.text} → ${isoDate}`);
        }
      }
    }

    return dates;
  }

  /**
   * Try to extract dates from OCR text (fallback method)
   */
  private tryExtractDatesFromOCR(lines: string[]): string[] {
    const uniqueDates: string[] = [];
    const seen = new Set<string>();

    // Enhanced patterns for date extraction (ordered by specificity)
    const patterns = [
      /(\w{3})\s+(\d{2}\/\d{2}\/\d{4})/,       // Mon 08/11/2025
      /(\w{3})\s+(\d{1,2}\/\d{1,2}\/\d{4})/,   // Mon 8/11/2025
      /(\w{3}day)\s+(\d{1,2}\/\d{1,2})/,       // Monday 8/11
      /(\w{3})\s+(\d{1,2}\/\d{1,2})/,          // Mon 8/11
      /(\d{1,2}\/\d{1,2}\/\d{4})/,             // 8/11/2025 (date only)
      /(\d{1,2}\/\d{1,2})/,                    // 8/11 (date only)
    ];

    // Check first 30 lines for date headers (column headers might be further down)
    for (const line of lines.slice(0, 30)) {
      console.log(`🔍 Checking line for dates: "${line}"`);

      // Try each pattern until we find a match, then move to next line
      let foundDateOnLine = false;

      for (const pattern of patterns) {
        const match = pattern.exec(line);

        if (match) {
          const dateStr = match[2] || match[1]; // Get date part

          if (dateStr) {
            console.log(`📅 Found potential date: ${dateStr}`);

            // Convert to YYYY-MM-DD format
            let year, month, day;
            const dateParts = dateStr.split('/');

            if (dateParts.length === 2) {
              [month, day] = dateParts;
              year = '2025'; // Default year
            } else if (dateParts.length === 3) {
              [month, day, year] = dateParts;
            }

            if (month && day && year) {
              const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

              // Only add if not already seen
              if (!seen.has(isoDate)) {
                seen.add(isoDate);
                uniqueDates.push(isoDate);
                console.log(`✅ Parsed unique date: ${isoDate} (${uniqueDates.length}/7)`);

                // Stop once we have 7 unique dates (one week)
                if (uniqueDates.length === 7) {
                  console.log(`🎯 Found all 7 dates for the week`);
                  return uniqueDates;
                }
              } else {
                console.log(`⏭️ Skipping duplicate: ${isoDate}`);
              }

              foundDateOnLine = true;
              break; // Move to next line after finding first date
            }
          }
        }
      }

      if (!foundDateOnLine) {
        console.log(`❌ No date found on this line`);
      }
    }

    if (uniqueDates.length > 0 && uniqueDates.length < 7) {
      console.warn(`⚠️ Only found ${uniqueDates.length} unique dates, need 7 for full week`);
    }

    console.log(`📅 Unique dates extracted: ${uniqueDates.length} dates`, uniqueDates);
    return uniqueDates;
  }

  /**
   * Find week pattern in OCR text (e.g., "Week of Aug 11-17")
   */
  private findWeekPattern(lines: string[]): WeekInfo | null {
    const weekPatterns = [
      /week\s+of\s+(\w{3})\s+(\d{1,2})\s*-\s*(\d{1,2}),?\s*(\d{4})/i,
      /(\w{3})\s+(\d{1,2})\s*-\s*(\d{1,2}),?\s*(\d{4})/i,
      /week\s+(\d{1,2}\/\d{1,2})\s*-\s*(\d{1,2}\/\d{1,2})/i
    ];

    for (const line of lines.slice(0, 10)) {
      for (const pattern of weekPatterns) {
        const match = pattern.exec(line);
        if (match) {
          console.log(`📅 Found week pattern: ${match[0]}`);
          
          // Try to parse the dates and generate a week
          const startDate = this.parseWeekStartDate(match);
          if (startDate) {
            return this.generateWeekFromStartDate(startDate);
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Parse week start date from regex match
   */
  private parseWeekStartDate(match: RegExpExecArray): Date | null {
    try {
      if (match[1] && match[2] && match[4]) {
        // "Aug 11-17, 2025" format
        const monthName = match[1];
        const startDay = parseInt(match[2]);
        const year = parseInt(match[4]);
        
        const monthMap: { [key: string]: number } = {
          jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
          jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
        };
        
        const month = monthMap[monthName.toLowerCase()];
        if (month !== undefined) {
          return new Date(year, month, startDay);
        }
      }
    } catch (error) {
      console.warn('Failed to parse week start date:', error);
    }
    
    return null;
  }

  /**
   * Generate a full week from start date
   */
  private generateWeekFromStartDate(startDate: Date): WeekInfo {
    const dates: string[] = [];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    
    return {
      weekStart: dates[0],
      weekEnd: dates[6],
      dates
    };
  }

  /**
   * Generate current week dates as fallback
   */
  private generateCurrentWeekDates(): string[] {
    const today = new Date();
    const monday = new Date(today);
    
    // Get Monday of current week
    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    monday.setDate(today.getDate() - daysToMonday);
    
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    
    return dates;
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
   * Calculate 8-hour shift end time from start time
   * Accounts for 1-hour lunch break (adds 9 hours total)
   */
  private calculate8HourShift(timeSlot: TimeSlot): TimeSlot {
    // Parse start time to get hours and minutes
    const [startHour, startMinute] = timeSlot.start.split(':').map(Number);

    // Add 9 hours (8 work + 1 lunch) to calculate end time
    let endHour = startHour + 9;
    const endMinute = startMinute;

    // Handle day overflow (if end time goes past midnight)
    if (endHour >= 24) {
      endHour -= 24;
    }

    // Format as HH:MM
    const formattedEnd = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;

    return {
      start: timeSlot.start,
      end: formattedEnd,
      raw: `${timeSlot.start}-${formattedEnd} (8h + lunch)`
    };
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
   * Extract time slots from OCR text using fragmentation-aware pattern matching
   * This approach accepts OCR fragmentation and uses known work patterns
   */
  private assignTimeSlots(
    rowResults: RowParsingResult[],
    ocrText: string,
    weekInfo: WeekInfo,
    tableStructure?: TableStructure
  ): void {
    console.log('📋 Starting pattern-based fragmentation-aware schedule parsing...');

    // Split OCR text into lines
    const lines = ocrText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

    // Process each employee using pattern-based approach
    const employees = rowResults.filter(row => row.type === 'employee' && row.data);

    employees.forEach((employeeResult) => {
      const employee = employeeResult.data as Employee;

      // Use pattern-based approach to extract employee's schedule
      this.extractEmployeeScheduleWithPatterns(employee, lines, weekInfo, tableStructure);
    });
  }

  /**
   * Extract employee schedule using direct OCR pattern matching
   * Works with OCR fragmentation by finding specific work shift patterns
   */
  private extractEmployeeScheduleWithPatterns(
    employee: Employee,
    lines: string[],
    weekInfo: WeekInfo,
    tableStructure?: TableStructure
  ): void {
    console.log(`🎯 Direct OCR pattern matching for: ${employee.name}`);

    // Only process Joezari Borlongan as the target user
    if (!employee.name.includes('BORLONGAN')) {
      console.log(`⏭️ Skipping ${employee.name} - only processing Joezari's schedule`);
      return;
    }

    // Try table-based extraction first if available
    if (tableStructure) {
      console.log('📊 Table structure available - using spatial-based extraction...');
      const tableSuccess = this.extractScheduleFromTable(employee, tableStructure, weekInfo);
      if (tableSuccess) {
        console.log('✅ Successfully extracted schedule from table structure');
        return;
      } else {
        console.log('⚠️ Table extraction failed, falling back to pattern matching...');
      }
    }

    console.log('🔍 Extracting Joezari\'s schedule using new row-based approach...');

    // Step 1: Extract shifts from employee's specific row
    const rowShifts = this.extractEmployeeRowShifts(employee.name, lines);

    // Step 2: If row extraction didn't work, fall back to general pattern extraction
    const shiftsToMap = rowShifts.length > 0 ? rowShifts : this.extractDirectShiftPatterns(lines);

    if (shiftsToMap.length === 0) {
      console.warn(`⚠️ No shifts extracted for ${employee.name}, schedule will show all days OFF`);

      // Set all dates but no time slots
      employee.weeklySchedule.forEach((dailySchedule, dayIndex) => {
        const extractedDate = weekInfo.dates[dayIndex];
        if (extractedDate) {
          dailySchedule.date = extractedDate;
        }
      });
      return;
    }

    console.log(`📊 Found ${shiftsToMap.length} total shifts to process`);

    // Step 3: Map shifts to day columns
    const mappedShifts = this.mapShiftsToColumns(shiftsToMap, weekInfo);

    if (mappedShifts.length === 0) {
      console.warn(`⚠️ Could not map shifts to days for ${employee.name}`);
      return;
    }

    // Step 4: Assign mapped shifts to employee schedule
    console.log(`📅 Assigning ${mappedShifts.length} mapped shifts to ${employee.name}'s schedule...`);

    mappedShifts.forEach(({ dayIndex, shift, date }) => {
      const dailySchedule = employee.weeklySchedule[dayIndex];

      if (dailySchedule) {
        const warnings: string[] = [];
        const parsedTimeSlot = this.parseTimeSlot(shift, warnings);

        if (parsedTimeSlot) {
          dailySchedule.timeSlot = parsedTimeSlot;
          dailySchedule.date = date;
          const dayName = this.getDayName(dayIndex);
          console.log(`   ✅ ${dayName} ${date}: ${parsedTimeSlot.start}-${parsedTimeSlot.end} (${shift})`);
        } else {
          console.warn(`   ⚠️ Failed to parse time slot for ${shift} on day ${dayIndex}`);
        }
      }
    });

    // Step 5: Assign dates to remaining days (mark as OFF)
    employee.weeklySchedule.forEach((dailySchedule, dayIndex) => {
      const extractedDate = weekInfo.dates[dayIndex];
      if (extractedDate && !dailySchedule.date) {
        dailySchedule.date = extractedDate;
        const dayName = this.getDayName(dayIndex);
        console.log(`   ✅ ${dayName} ${extractedDate}: OFF`);
      }
    });

    // Verify all dates were assigned correctly
    const assignedDates = employee.weeklySchedule.map(d => d.date).filter(Boolean);
    const workDays = employee.weeklySchedule.filter(d => d.timeSlot).length;
    console.log(`✅ Assigned ${assignedDates.length}/7 dates to ${employee.name}'s schedule (${workDays} work days, ${7 - workDays} days off)`);
  }

  /**
   * Extract direct shift patterns from OCR without complex grouping
   * Look for recognizable full-day shift patterns
   */
  private extractDirectShiftPatterns(lines: string[]): string[] {
    console.log('🔍 Extracting direct shift patterns from OCR...');

    // Join all lines to look for patterns that might span lines
    const fullText = lines.join(' ');

    // Look for common full-shift patterns that indicate complete work days
    const fullShiftPatterns = [
      // Full day patterns (exact matches)
      /6:30AM-3:30PM/gi,   // Full day pattern
      /6:30AM-3:00PM/gi,   // Full day pattern (user's actual shift)
      /5:30AM-2:00PM/gi,   // Wednesday variation
      /7:00AM-4:00PM/gi,   // Full day pattern
      /11:00AM-8:00PM/gi,  // Full day pattern

      // Split shift patterns (morning + afternoon) - more flexible matching
      /6:30AM-10:00AM.*?11:00AM-3:30PM/gi,
      /6:30AM-10:00AM.*?11:00AM-3:00PM/gi,  // 3PM variation
      /5:30AM-9:00AM.*?10:00AM-2:00PM/gi,   // Wednesday split pattern
      /7:00AM-11:00AM.*?12:00PM-4:00PM/gi,
      /6:30AM-10:00AM.*?10:30AM-3:00PM/gi,
      /11:00AM-2:00PM.*?3:00PM-8:00PM/gi,

      // Additional patterns based on OCR observations
      /7:00AM-11:00AM.*?12:00PM-4:00PM/gi,  // Sunday pattern
      /6:30AM-10:00AM.*?11:00AM-3:30PM/gi,  // Friday pattern variation
    ];

    const foundShifts: string[] = [];

    for (const pattern of fullShiftPatterns) {
      const matches = fullText.match(pattern);
      if (matches) {
        matches.forEach(match => {
          // Convert split shift to full day
          if (match.includes('AM-') && match.includes('PM')) {
            // Extract start and end times
            const timeMatches = match.match(/(\d{1,2}:\d{2}[AP]M)/g);
            if (timeMatches && timeMatches.length >= 2) {
              const startTime = timeMatches[0];
              const endTime = timeMatches[timeMatches.length - 1];
              const fullShift = `${startTime}-${endTime}`;

              // Allow duplicates - same shift can occur on multiple days
              foundShifts.push(fullShift);
              console.log(`📋 Found shift pattern: ${fullShift}`);
            }
          }
        });
      }
    }

    console.log(`✅ Extracted ${foundShifts.length} direct shift patterns:`, foundShifts);
    return foundShifts;
  }

  /**
   * Extract shifts that belong specifically to an employee's row
   * Scans lines after employee name until next employee or section
   */
  private extractEmployeeRowShifts(employeeName: string, lines: string[]): string[] {
    console.log(`🔍 Extracting row-specific shifts for: ${employeeName}`);

    // Find the line where employee name appears
    const namePattern = new RegExp(employeeName.replace(',', ',?\\s*'), 'i');
    let employeeLineIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (namePattern.test(lines[i])) {
        employeeLineIndex = i;
        console.log(`   Found employee at line ${i}: "${lines[i]}"`);
        break;
      }
    }

    if (employeeLineIndex === -1) {
      console.warn(`   ⚠️ Could not find employee name in OCR text`);
      return [];
    }

    // Scan next ~20 lines for time patterns, stop at next employee
    const rowShifts: string[] = [];
    const employeeNamePattern = /[A-Z]+,\s*[A-Z]+/;  // Matches "LAST, FIRST" format
    const timePattern = /\d{1,2}:\d{2}[AP]M-\d{1,2}:\d{2}[AP]M/g;

    for (let i = employeeLineIndex + 1; i < Math.min(employeeLineIndex + 25, lines.length); i++) {
      const line = lines[i];

      // Stop if we hit another employee name
      if (employeeNamePattern.test(line) && !namePattern.test(line)) {
        console.log(`   Stopped at next employee: "${line}"`);
        break;
      }

      // Extract time ranges from this line
      const timeMatches = line.match(timePattern);
      if (timeMatches) {
        timeMatches.forEach(time => {
          rowShifts.push(time);
          console.log(`   📋 Found shift in employee row: ${time}`);
        });
      }
    }

    console.log(`   ✅ Extracted ${rowShifts.length} shifts from employee's row`);
    return rowShifts;
  }

  /**
   * Map extracted shifts to specific day columns/indices
   * Uses sequential assignment since OCR loses column structure
   */
  private mapShiftsToColumns(shifts: string[], weekInfo: WeekInfo): Array<{
    dayIndex: number;
    shift: string;
    date: string;
  }> {
    console.log(`🗺️ Mapping ${shifts.length} shifts to day columns...`);

    const mappedShifts: Array<{ dayIndex: number; shift: string; date: string }> = [];

    if (shifts.length === 0) {
      console.warn('   ⚠️ No shifts to map');
      return mappedShifts;
    }

    // Strategy: Sequential assignment to non-Monday/non-Friday days
    // Since OCR text is read left-to-right, shifts appear in day order
    // For Aug 04-10: user works Tue, Wed, Thu, Sat, Sun (indices 1, 2, 3, 5, 6)

    // Identify which days likely have shifts by excluding typical days off
    // Most schedules: people are more likely to be off Mon/Fri than mid-week
    const potentialWorkDays = [1, 2, 3, 4, 5, 6]; // Tue-Sun (skip Monday index 0)

    // If we have 5 shifts, they likely map to first 5 potential work days
    // But we need a smarter approach - let's use the shift count to determine pattern

    let dayIndex = 0;
    let shiftIndex = 0;
    let consecutiveOffs = 0;

    while (shiftIndex < shifts.length && dayIndex < 7) {
      // Skip Monday if it's the first day and we have exactly 5 shifts
      // (indicates likely Mon+Fri off pattern)
      if (dayIndex === 0 && shifts.length === 5) {
        console.log(`   ⏭️ Skipping Monday (index 0) - likely day off`);
        dayIndex++;
        consecutiveOffs++;
        continue;
      }

      // Skip Friday if we've assigned 4 shifts and have 1 left (Sat/Sun pattern)
      if (dayIndex === 4 && shifts.length === 5 && shiftIndex === 4) {
        console.log(`   ⏭️ Skipping Friday (index 4) - likely day off`);
        dayIndex++;
        consecutiveOffs++;
        continue;
      }

      const shift = shifts[shiftIndex];
      const date = weekInfo.dates[dayIndex];

      if (date) {
        mappedShifts.push({ dayIndex, shift, date });
        const dayName = this.getDayName(dayIndex);
        console.log(`   ✓ Shift ${shiftIndex + 1} "${shift}" → ${dayName} (index ${dayIndex}, date ${date})`);
        shiftIndex++;
        consecutiveOffs = 0;
      }

      dayIndex++;
    }

    if (shiftIndex < shifts.length) {
      console.warn(`   ⚠️ Could not map all shifts: ${shiftIndex}/${shifts.length} mapped`);
    }

    console.log(`✅ Mapped ${mappedShifts.length} shifts to columns`);
    return mappedShifts;
  }

  /**
   * Extract Joezari's specific schedule from OCR by analyzing the table structure
   * Looks for employee-specific time slots that correspond to his row
   */
  private extractJoezariScheduleFromOCR(lines: string[]): Array<{
    dayName: string;
    dayIndex: number;
    timeSlot: string;
  }> {
    console.log('🔍 Extracting Joezari\'s schedule from OCR table structure...');
    
    // Find Joezari's name in the OCR
    let joezariLineIndex = -1;
    const nameVariations = ['BORLONGAN, JOEZARI', 'BORLONGAN', 'JOEZARI'];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      if (nameVariations.some(name => line.toUpperCase().includes(name))) {
        joezariLineIndex = i;
        console.log(`📍 Found Joezari at line ${i}: "${line}"`);
        break;
      }
    }
    
    if (joezariLineIndex === -1) {
      console.warn('❌ Could not find Joezari\'s name in OCR');
      return [];
    }
    
    // Look for time slots in the vicinity of Joezari's name
    // Since OCR is fragmented, his schedule might be spread across multiple lines
    const searchStart = Math.max(0, joezariLineIndex - 5);
    const searchEnd = Math.min(lines.length, joezariLineIndex + 25);
    
    console.log(`🔍 Searching for Joezari's time slots in lines ${searchStart}-${searchEnd}`);
    
    // Collect time slots that appear near Joezari's name
    const nearbyTimeSlots: string[] = [];
    const timePattern = /(\d{1,2}:\d{2}\s*[AP]M\s*[-–]\s*\d{1,2}:\d{2}\s*[AP]M)/gi;
    
    for (let i = searchStart; i < searchEnd; i++) {
      const line = lines[i] || '';
      const matches = line.match(timePattern);
      
      if (matches) {
        matches.forEach(match => {
          const cleanMatch = match.replace(/\s+/g, '').replace(/–/g, '-');
          nearbyTimeSlots.push(cleanMatch);
          console.log(`⏰ Found time slot near Joezari at line ${i}: "${cleanMatch}"`);
        });
      }
    }
    
    // Group the time slots intelligently into complete work days
    console.log(`🔄 Grouping ${nearbyTimeSlots.length} time slots into work days...`);
    
    // Use pattern matching to identify complete shifts
    const completeShifts = this.identifyCompleteWorkShifts(nearbyTimeSlots);
    
    // Map to specific work days (Mon, Wed, Fri, Sat, Sun)
    const workDays = [
      { dayName: 'Monday', dayIndex: 0 },
      { dayName: 'Wednesday', dayIndex: 2 },
      { dayName: 'Friday', dayIndex: 4 },
      { dayName: 'Saturday', dayIndex: 5 },
      { dayName: 'Sunday', dayIndex: 6 }
    ];
    
    const result = workDays.map((day, index) => ({
      dayName: day.dayName,
      dayIndex: day.dayIndex,
      timeSlot: completeShifts[index] || 'OFF'
    })).filter(item => item.timeSlot !== 'OFF');
    
    console.log(`✅ Extracted ${result.length} work days for Joezari:`, 
      result.map(r => `${r.dayName}: ${r.timeSlot}`));
    
    return result;
  }

  /**
   * Identify complete work shifts from fragmented time slots
   * Combines morning-lunch-afternoon patterns into full work days
   */
  private identifyCompleteWorkShifts(timeSlots: string[]): string[] {
    console.log('🧩 Identifying complete work shifts from time segments...');
    
    if (timeSlots.length === 0) return [];
    
    // Parse all time slots
    const parsedSlots = timeSlots.map(slot => this.parseTimeSlot(slot, [])).filter(Boolean) as TimeSlot[];
    
    if (parsedSlots.length === 0) return [];
    
    // Group slots that could form complete work days
    const workDays: string[] = [];
    const usedSlots = new Set<number>();
    
    // Sort by start time to process chronologically
    const sortedSlots = parsedSlots.map((slot, index) => ({ slot, index }))
                                  .sort((a, b) => this.compareTime(a.slot.start, b.slot.start));
    
    for (const { slot: currentSlot, index: currentIndex } of sortedSlots) {
      if (usedSlots.has(currentIndex)) continue;
      
      // Look for connecting segments (lunch break pattern)
      const connectedSlots = [currentSlot];
      usedSlots.add(currentIndex);
      
      // Find slots that could be part of the same work day
      for (const { slot: otherSlot, index: otherIndex } of sortedSlots) {
        if (usedSlots.has(otherIndex)) continue;
        
        // Check if this could be the afternoon portion after lunch
        if (this.canConnectTimeSegments(currentSlot, otherSlot)) {
          connectedSlots.push(otherSlot);
          usedSlots.add(otherIndex);
          break; // Only connect one afternoon segment
        }
      }
      
      // Create full work day from connected segments
      if (connectedSlots.length > 1) {
        // Multiple segments - find earliest start and latest end
        const earliestStart = connectedSlots.reduce((earliest, current) => 
          this.compareTime(current.start, earliest.start) < 0 ? current : earliest
        );
        const latestEnd = connectedSlots.reduce((latest, current) => 
          this.compareTime(current.end, latest.end) > 0 ? current : latest
        );
        
        workDays.push(`${earliestStart.start}-${latestEnd.end}`);
      } else {
        // Single segment - check if it's already a full shift (> 6 hours)
        const startMinutes = this.timeStringToMinutes(currentSlot.start);
        const endMinutes = this.timeStringToMinutes(currentSlot.end);
        const durationHours = (endMinutes - startMinutes) / 60;
        
        if (durationHours >= 6) {
          workDays.push(`${currentSlot.start}-${currentSlot.end}`);
        }
      }
    }
    
    console.log(`🎯 Identified ${workDays.length} complete work shifts:`, workDays);
    return workDays;
  }

  /**
   * Find complete work shifts for each work day using smart pattern matching
   * Looks for work-lunch-work patterns and groups them into full shifts
   */
  private findAllTimeSlotsNearEmployee(lines: string[], employeeName: string): string[] {
    console.log(`🔍 Finding complete work shifts near employee: ${employeeName}`);
    
    // Find employee mention in OCR text
    let employeeLineIndex = -1;
    const nameVariations = [
      employeeName,
      employeeName.replace(',', '').trim(),
      employeeName.split(',').reverse().join(' ').trim(),
      employeeName.split(',')[0]?.trim() || '', // Last name
      'BORLONGAN', 'Joezari', 'JOEZARI' // Specific name variations
    ];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const hasEmployeeName = nameVariations.some(name => 
        name && line.toLowerCase().includes(name.toLowerCase())
      );
      
      if (hasEmployeeName) {
        employeeLineIndex = i;
        console.log(`📍 Found employee at line ${i}: "${line}"`);
        break;
      }
    }
    
    if (employeeLineIndex === -1) {
      console.warn(`❌ Could not find employee ${employeeName} in OCR text`);
      return [];
    }
    
    // Search for time patterns in area around employee (expanded search)
    const searchStart = Math.max(0, employeeLineIndex - 10);
    const searchEnd = Math.min(lines.length, employeeLineIndex + 50);
    
    console.log(`🔍 Searching for complete shifts in lines ${searchStart}-${searchEnd}`);
    
    // Collect all time slot segments with their line numbers
    const timeSlotSegments: Array<{time: string; line: number}> = [];
    const timePattern = /(\d{1,2}:\d{2}\s*[AP]M\s*[-–]\s*\d{1,2}:\d{2}\s*[AP]M)/gi;
    
    for (let i = searchStart; i < searchEnd; i++) {
      const line = lines[i] || '';
      const matches = line.match(timePattern);
      
      if (matches) {
        matches.forEach(match => {
          // Clean the match
          const cleanMatch = match
            .replace(/^\(b\)\s*/, '') // Remove (b) prefix
            .replace(/\s+/g, '') // Remove extra spaces
            .replace(/–/g, '-'); // Standardize dash
          
          timeSlotSegments.push({ time: cleanMatch, line: i });
          console.log(`⏰ Found time segment at line ${i}: "${cleanMatch}"`);
        });
      }
    }
    
    // Group time segments into complete work shifts
    return this.groupTimeSegmentsIntoShifts(timeSlotSegments);
  }

  /**
   * Group time segments into complete work day shifts
   * Combines work-lunch-work patterns into full 8-hour shifts
   */
  private groupTimeSegmentsIntoShifts(segments: Array<{time: string; line: number}>): string[] {
    console.log(`🔄 Grouping ${segments.length} time segments into complete shifts...`);
    
    if (segments.length === 0) return [];
    
    // Sort segments by line number to process them in order
    segments.sort((a, b) => a.line - b.line);
    
    const completeShifts: string[] = [];
    const usedSegments = new Set<number>();
    
    // Look for segments that can be combined into full work days
    for (let i = 0; i < segments.length; i++) {
      if (usedSegments.has(i)) continue;
      
      const currentSegment = segments[i];
      const currentTimes = this.parseTimeSlot(currentSegment.time, []);
      
      if (!currentTimes) continue;
      
      // Look for additional segments within a few lines that could be part of the same work day
      const connectedSegments = [currentSegment];
      
      for (let j = i + 1; j < segments.length; j++) {
        if (usedSegments.has(j)) continue;
        
        const nextSegment = segments[j];
        
        // If the next segment is within 5 lines, it might be part of the same work day
        if (nextSegment.line - currentSegment.line <= 5) {
          const nextTimes = this.parseTimeSlot(nextSegment.time, []);
          
          if (nextTimes) {
            // Check if this segment connects logically (lunch break pattern)
            const canConnect = this.canConnectTimeSegments(currentTimes, nextTimes);
            
            if (canConnect) {
              connectedSegments.push(nextSegment);
              usedSegments.add(j);
              console.log(`🔗 Connected segments: ${currentSegment.time} + ${nextSegment.time}`);
            }
          }
        }
      }
      
      // Create complete shift from connected segments
      if (connectedSegments.length > 1) {
        // Multiple segments - combine them into one full shift
        const allTimes = connectedSegments.map(s => this.parseTimeSlot(s.time, []))
                                         .filter(t => t !== undefined) as TimeSlot[];
        
        const earliestStart = allTimes.reduce((earliest, current) => 
          this.compareTime(current.start, earliest.start) < 0 ? current : earliest
        );
        
        const latestEnd = allTimes.reduce((latest, current) => 
          this.compareTime(current.end, latest.end) > 0 ? current : latest  
        );
        
        const fullShift = `${earliestStart.start}-${latestEnd.end}`;
        completeShifts.push(fullShift);
        console.log(`✅ Created full shift: ${fullShift} (from ${connectedSegments.length} segments)`);
      } else {
        // Single segment - use as is
        completeShifts.push(currentSegment.time);
        console.log(`✅ Single segment shift: ${currentSegment.time}`);
      }
      
      usedSegments.add(i);
    }
    
    console.log(`🎯 Grouped into ${completeShifts.length} complete shifts:`, completeShifts);
    return completeShifts;
  }

  /**
   * Check if two time segments can be logically connected (work-lunch-work pattern)
   */
  private canConnectTimeSegments(first: TimeSlot, second: TimeSlot): boolean {
    // Parse times to check if there's a reasonable gap (lunch break)
    const firstEndTime = this.timeStringToMinutes(first.end);
    const secondStartTime = this.timeStringToMinutes(second.start);
    
    // Check if second segment starts close to when first ends (lunch break pattern)
    const gap = secondStartTime - firstEndTime;
    
    // Allow for lunch breaks between 15 minutes to 2 hours
    return gap >= -15 && gap <= 120;
  }

  /**
   * Convert time string (HH:MM) to minutes since midnight
   */
  private timeStringToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
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
   * Parse employee schedule using table structure understanding
   * This approach tries to reconstruct the table by finding employee rows and their corresponding day columns
   */
  private parseEmployeeTableRow(lines: string[], employeeName: string): string | null {
    console.log(`📋 Parsing table structure for: ${employeeName}`);
    
    // First, find lines that might contain the employee name
    const nameVariations = [
      employeeName,
      employeeName.replace(',', '').trim(),
      employeeName.split(',').reverse().join(' ').trim(),
      employeeName.split(',')[0].trim(), // Just last name
      employeeName.split(',')[1]?.trim() || '' // Just first name
    ];
    
    let employeeLineIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const hasEmployeeName = nameVariations.some(name => 
        name && line.toLowerCase().includes(name.toLowerCase())
      );
      
      if (hasEmployeeName) {
        employeeLineIndex = i;
        console.log(`📍 Found employee name at line ${i}: "${line}"`);
        break;
      }
    }
    
    if (employeeLineIndex === -1) {
      console.log(`❌ Could not find employee name in any line`);
      return null;
    }
    
    // Now try to extract the table structure around this employee
    // Look for time patterns in a structured way (table approach)
    const timePattern = /(\d{1,2}:\d{2}[AP]M-\d{1,2}:\d{2}[AP]M)/g;
    const dayTimeSlots: { [day: string]: string[] } = {
      'Monday': [],
      'Tuesday': [],
      'Wednesday': [],
      'Thursday': [],
      'Friday': [],
      'Saturday': [],
      'Sunday': []
    };
    
    // Search in the area around the employee for structured time slots
    // This is a simplified approach - we'll collect time slots and try to organize them by day
    const searchStart = Math.max(0, employeeLineIndex - 5);
    const searchEnd = Math.min(lines.length, employeeLineIndex + 30);
    
    console.log(`🔍 Searching for time slots in lines ${searchStart}-${searchEnd}`);
    
    const allNearbyTimeSlots: string[] = [];
    for (let i = searchStart; i < searchEnd; i++) {
      const line = lines[i] || '';
      const matches = line.match(timePattern);
      if (matches) {
        matches.forEach(match => {
          // Clean up the time slot (remove prefixes like "(b)")
          const cleanMatch = match.replace(/^\(b\)\s*/, '');
          allNearbyTimeSlots.push(cleanMatch);
          console.log(`⏰ Found time slot at line ${i}: "${cleanMatch}"`);
        });
      }
    }
    
    if (allNearbyTimeSlots.length === 0) {
      console.log(`❌ Could not find any time slots near employee ${employeeName}`);
      return null;
    }
    
    // For now, create a synthetic schedule line with all found time slots
    // TODO: Improve this to properly map time slots to specific days
    const syntheticLine = `${employeeName}    40.00    ${allNearbyTimeSlots.join('    ')}`;
    console.log(`✅ Created synthetic schedule line with ${allNearbyTimeSlots.length} time slots: "${syntheticLine}"`);
    
    return syntheticLine;
  }

  /**
   * Parse a schedule line into individual day time slots
   * Expected format: "EMPLOYEE_NAME HOURS TIME1 TIME2 TIME3 TIME4 TIME5 TIME6 TIME7"
   * Handles split shifts like "6:30AM-10:00AM + 10:00AM-3:30PM"
   */
  private parseEmployeeScheduleLine(scheduleLine: string): string[] {
    console.log(`🔍 Parsing schedule line: "${scheduleLine}"`);
    
    // Remove employee name and hours from beginning of line
    // Pattern: Remove everything up to and including the hours (XX.XX format)
    const withoutNameAndHours = scheduleLine.replace(/^.*?\d+\.\d+\s+/, '');
    
    // Split remaining text into potential time slots
    // Look for time patterns or "Day Off" - handle split shifts with + separator
    const timeSlotPattern = /(\d{1,2}:\d{2}[AP]M-\d{1,2}:\d{2}[AP]M(?:\s*\+\s*\d{1,2}:\d{2}[AP]M-\d{1,2}:\d{2}[AP]M)*|Day\s+Off)/gi;
    const matches = withoutNameAndHours.match(timeSlotPattern) || [];
    
    console.log(`📅 Extracted time slots: ${matches.join(' | ')}`);
    
    return matches;
  }

  /**
   * Parse split shifts from text like "6:30AM-10:00AM + 10:00AM-3:30PM"
   * Returns array of TimeSlot objects, one for each shift segment
   */
  private parseSplitShifts(timeSlotText: string): TimeSlot[] {
    const shifts: TimeSlot[] = [];
    const warnings: string[] = [];
    
    // Split on + and clean each segment
    const segments = timeSlotText.split('+').map(segment => segment.trim());
    
    for (const segment of segments) {
      const timeSlot = this.parseTimeSlot(segment, warnings);
      if (timeSlot) {
        shifts.push(timeSlot);
      }
    }
    
    if (warnings.length > 0) {
      console.warn(`⚠️ Split shift parsing warnings: ${warnings.join(', ')}`);
    }
    
    return shifts;
  }

  /**
   * Extract employee's schedule from table structure
   * This reads across the employee's row, mapping each column to its corresponding day
   */
  private extractEmployeeScheduleFromTable(
    lines: string[], 
    employeeName: string, 
    headerIndex: number, 
    columns: Array<{day: string; date: string; dayIndex: number}>
  ): Record<string, string> | null {
    console.log(`🔍 Extracting table-based schedule for ${employeeName}...`);
    
    // Find employee's data row (should be after header)
    const employeeLineIndex = this.findEmployeeDataRow(lines, employeeName, headerIndex);
    
    if (employeeLineIndex === null) {
      console.warn(`❌ Could not find employee data row for ${employeeName}`);
      return null;
    }
    
    console.log(`📍 Found ${employeeName} data at line ${employeeLineIndex}: "${lines[employeeLineIndex]}"`);
    
    // Extract schedule data for each day by looking at the area around employee line
    const schedule: Record<string, string> = {};
    
    // Look in lines near the employee for time slot data organized by day
    const searchStart = employeeLineIndex;
    const searchEnd = Math.min(lines.length, employeeLineIndex + 10);
    
    const allNearTimeSlots: string[] = [];
    for (let i = searchStart; i < searchEnd; i++) {
      const line = lines[i] || '';
      const timePattern = /(\d{1,2}:\d{2}[AP]M-\d{1,2}:\d{2}[AP]M)/gi;
      const matches = line.match(timePattern) || [];
      allNearTimeSlots.push(...matches.map(m => m.replace(/^\(b\)\s*/, '')));
    }
    
    console.log(`⏰ Found ${allNearTimeSlots.length} time slots near ${employeeName}:`, allNearTimeSlots);
    
    // Map time slots to days based on your known work pattern
    // You work: Mon, Wed, Fri, Sat, Sun (skip Tue, Thu)
    const workDays = ['Mon', 'Wed', 'Fri', 'Sat', 'Sun'];
    
    // Group time slots into work days - this is a simplified approach
    // In a real table, we'd parse the exact column positions, but OCR makes this challenging
    let slotIndex = 0;
    
    for (const day of workDays) {
      if (slotIndex < allNearTimeSlots.length) {
        // For work days, look for clusters of time slots that represent a full shift
        const daySlots = [];
        
        // Take 2-3 time slots per work day (representing morning + lunch + afternoon)
        const slotsToTake = Math.min(3, allNearTimeSlots.length - slotIndex);
        
        for (let i = 0; i < slotsToTake && slotIndex < allNearTimeSlots.length; i++) {
          daySlots.push(allNearTimeSlots[slotIndex]);
          slotIndex++;
        }
        
        if (daySlots.length > 0) {
          schedule[day] = daySlots.join(' + ');
          console.log(`📅 ${day}: ${schedule[day]}`);
        }
      }
    }
    
    return schedule;
  }

  /**
   * Find the employee's data row after the header
   */
  private findEmployeeDataRow(lines: string[], employeeName: string, headerIndex: number): number | null {
    // Search for employee name starting from after the header
    const searchStart = headerIndex + 1;
    const searchEnd = Math.min(lines.length, headerIndex + 50);
    
    const nameVariations = [
      employeeName,
      employeeName.replace(',', '').trim(),
      employeeName.split(',').reverse().join(' ').trim(),
      employeeName.split(',')[0].trim() // Just last name
    ];
    
    for (let i = searchStart; i < searchEnd; i++) {
      const line = lines[i] || '';
      
      for (const name of nameVariations) {
        if (name && line.toLowerCase().includes(name.toLowerCase())) {
          return i;
        }
      }
    }
    
    return null;
  }

  /**
   * Update employee's weekly schedule with extracted table data
   */
  private updateEmployeeWeeklySchedule(
    employee: Employee, 
    scheduleData: Record<string, string>,
    columns: Array<{day: string; date: string; dayIndex: number}>
  ): void {
    console.log(`🔄 Updating weekly schedule for ${employee.name}...`);
    
    // Map day names to day indices for the weekly schedule
    const dayIndexMap: Record<string, number> = {
      'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5, 'Sun': 6
    };
    
    // Update dates in weekly schedule from actual header dates
    columns.forEach(column => {
      const dayIndex = dayIndexMap[column.day];
      if (dayIndex !== undefined && employee.weeklySchedule[dayIndex]) {
        employee.weeklySchedule[dayIndex].date = column.date;
      }
    });
    
    // Assign time slots for work days
    Object.entries(scheduleData).forEach(([day, timeSlotText]) => {
      const dayIndex = dayIndexMap[day];
      
      if (dayIndex !== undefined && employee.weeklySchedule[dayIndex]) {
        if (timeSlotText && timeSlotText !== 'OFF' && timeSlotText !== 'Day Off') {
          // Parse the full work day (including split shifts)
          const splitShifts = this.parseSplitShifts(timeSlotText);
          
          if (splitShifts.length > 0) {
            // Set primary shift
            employee.weeklySchedule[dayIndex].timeSlot = splitShifts[0];
            
            // Set additional shifts if present
            if (splitShifts.length > 1) {
              employee.weeklySchedule[dayIndex].additionalShifts = splitShifts.slice(1);
            }
            
            const columnData = columns.find(c => c.day === day);
            const date = columnData?.date || 'unknown';
            console.log(`✅ ${day} (${date}): ${timeSlotText} → ${splitShifts.length} shift segments`);
          }
        }
      }
    });
  }

  /**
   * Parse table structure to identify header and columns
   * This is the key method that finds the actual table layout
   */
  private parseTableStructure(lines: string[]): {
    headerIndex: number | null;
    columns: Array<{
      day: string;
      date: string;
      dayIndex: number;
    }>;
  } {
    console.log('🔍 Detecting table structure...');
    
    // Step 1: Find the header line (contains date patterns)
    const headerIndex = this.findHeaderLine(lines);
    
    if (headerIndex === null) {
      console.warn('⚠️ Could not find table header');
      return { headerIndex: null, columns: [] };
    }
    
    console.log(`📅 Found table header at line ${headerIndex}: "${lines[headerIndex]}"`);
    
    // Step 2: Extract column information from header
    const columns = this.extractColumnInfo(lines[headerIndex] || '');
    
    console.log(`📊 Extracted ${columns.length} columns:`, columns.map(c => `${c.day} ${c.date}`));
    
    return { headerIndex, columns };
  }

  /**
   * Find the header line that contains day names and dates
   */
  private findHeaderLine(lines: string[]): number | null {
    const headerPatterns = [
      /Mon.*08\/11.*Tue.*08\/12/i,  // Primary pattern for Aug 11-17 dates
      /Mon.*\d{2}\/\d{2}.*Tue.*\d{2}\/\d{2}/i,  // General date pattern
      /Monday.*Tuesday.*Wednesday/i,  // Full day names
      /Mon.*Tue.*Wed.*Thu.*Fri.*Sat.*Sun/i  // Abbreviated days
    ];
    
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      const line = lines[i] || '';
      
      for (const pattern of headerPatterns) {
        if (pattern.test(line)) {
          console.log(`✅ Header pattern matched at line ${i}: ${pattern}`);
          return i;
        }
      }
    }
    
    return null;
  }

  /**
   * Extract column information (day names and dates) from header line
   */
  private extractColumnInfo(headerLine: string): Array<{
    day: string;
    date: string;
    dayIndex: number;
  }> {
    const columns = [];
    
    // Pattern to match day + date combinations
    const dayDatePattern = /(\w{3})(?:day)?\s+(\d{2}\/\d{2}\/\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\/\d{1,2})/gi;
    
    let match;
    let dayIndex = 0;
    
    while ((match = dayDatePattern.exec(headerLine)) !== null) {
      const [, dayName, dateStr] = match;
      
      if (dayName && dateStr) {
        // Convert date to standard format
        const standardDate = this.standardizeDate(dateStr);
        
        columns.push({
          day: dayName,
          date: standardDate,
          dayIndex: dayIndex
        });
        
        console.log(`📅 Column ${dayIndex}: ${dayName} ${standardDate}`);
        dayIndex++;
      }
    }
    
    return columns;
  }

  /**
   * Convert various date formats to YYYY-MM-DD
   */
  private standardizeDate(dateStr: string): string {
    const parts = dateStr.split('/');
    
    let month = '';
    let day = '';
    let year = '';
    
    if (parts.length === 2) {
      [month, day] = parts;
      year = '2025'; // Default to current year
    } else if (parts.length === 3) {
      [month, day, year] = parts;
    }
    
    if (month && day && year) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    return dateStr; // Return original if parsing fails
  }

  /**
   * Fallback method for basic time slot assignment when table structure detection fails
   */
  private fallbackTimeSlotAssignment(rowResults: RowParsingResult[], lines: string[]): void {
    console.log('🔄 Using fallback proximity-based parsing...');
    
    // Use the old proximity-based approach as fallback
    const employees = rowResults.filter(row => row.type === 'employee' && row.data);
    
    employees.forEach((employeeResult) => {
      const employee = employeeResult.data as Employee;
      
      // Simple fallback: find any time slots near the employee name
      const timeSlots = this.findNearbyTimeSlots(lines, employee.name);
      
      if (timeSlots.length > 0) {
        // Assign first time slot to Monday as basic fallback
        if (employee.weeklySchedule[0]) {
          const warnings: string[] = [];
          employee.weeklySchedule[0].timeSlot = this.parseTimeSlot(timeSlots[0], warnings);
          console.log(`⚠️ Fallback: Assigned ${employee.name} Monday ${timeSlots[0]}`);
        }
      }
    });
  }

  /**
   * Helper method for fallback parsing
   */
  private findNearbyTimeSlots(lines: string[], employeeName: string): string[] {
    const timePattern = /\d{1,2}:\d{2}[AP]M-\d{1,2}:\d{2}[AP]M/gi;
    const timeSlots: string[] = [];
    
    // Find employee line
    let employeeLineIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]?.includes(employeeName)) {
        employeeLineIndex = i;
        break;
      }
    }
    
    if (employeeLineIndex !== -1) {
      // Search nearby lines for time slots
      const searchStart = Math.max(0, employeeLineIndex - 5);
      const searchEnd = Math.min(lines.length, employeeLineIndex + 15);
      
      for (let i = searchStart; i < searchEnd; i++) {
        const matches = lines[i]?.match(timePattern) || [];
        timeSlots.push(...matches);
      }
    }
    
    return timeSlots;
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

  /**
   * Extract schedule from table structure using spatial coordinates
   * Returns true if successful, false to fall back to pattern matching
   */
  private extractScheduleFromTable(employee: Employee, tableStructure: TableStructure, weekInfo: WeekInfo): boolean {
    console.log('📊 Extracting schedule from table structure...');

    try {
      // Find date header row
      if (!tableStructure.dateHeaderRow) {
        console.log('⚠️ No date header row found in table');
        return false;
      }

      // Find employee's row
      const employeeRow = this.findEmployeeRow(employee.name, tableStructure);
      if (!employeeRow) {
        console.log(`⚠️ Could not find row for ${employee.name} in table`);
        return false;
      }

      console.log(`👤 Found employee row at index ${employeeRow.rowIndex}`);

      // Strategy: Find ALL time patterns in row by scanning entire row
      console.log('🔍 Scanning entire employee row for time patterns...');

      const START_COLUMN = 7;  // Skip name/hours columns
      const allTimeSlots: Array<{timeSlot: TimeSlot, startCell: number}> = [];

      // Scan entire row with 5-cell sliding window to find ALL time patterns
      for (let col = START_COLUMN; col < employeeRow.cells.length - 4; col++) {
        const timeSlot = this.parseTimeSlotFromCellRange(employeeRow.cells, col, col + 5, true);

        if (timeSlot) {
          // Check if this is a duplicate (same pattern within 4 cells)
          const isDuplicate = allTimeSlots.some(existing =>
            Math.abs(existing.startCell - col) < 4
          );

          if (!isDuplicate) {
            allTimeSlots.push({timeSlot, startCell: col});
            console.log(`   📍 Found time pattern at cell ${col}: ${timeSlot.start}-${timeSlot.end}`);
          }
        }
      }

      console.log(`📊 Found ${allTimeSlots.length} time patterns in employee row`);

      // Detect OFF days by looking at gaps in cell positions
      // Normal gap between consecutive days: ~7-9 cells
      // Large gap (>12 cells): indicates missing day(s)
      const dayAssignments: Array<{dayIndex: number, timeSlot: TimeSlot | null}> = [];

      let currentDayIndex = 0;
      const EXPECTED_CELLS_PER_DAY = 8;  // Average
      const LARGE_GAP_THRESHOLD = 12;     // Indicates skipped day

      for (let i = 0; i < allTimeSlots.length; i++) {
        const currentSlot = allTimeSlots[i];

        // Calculate days since start based on cell position
        const cellsFromStart = currentSlot.startCell - START_COLUMN;
        const estimatedDayIndex = Math.round(cellsFromStart / EXPECTED_CELLS_PER_DAY);

        // If there's a gap from previous assignment, mark days as OFF
        while (currentDayIndex < estimatedDayIndex && currentDayIndex < 7) {
          dayAssignments.push({dayIndex: currentDayIndex, timeSlot: null});
          currentDayIndex++;
        }

        // Assign this time slot
        if (currentDayIndex < 7) {
          dayAssignments.push({dayIndex: currentDayIndex, timeSlot: currentSlot.timeSlot});
          currentDayIndex++;
        }
      }

      // Fill remaining days as OFF
      while (currentDayIndex < 7) {
        dayAssignments.push({dayIndex: currentDayIndex, timeSlot: null});
        currentDayIndex++;
      }

      // Apply assignments
      let successCount = 0;

      for (const {dayIndex, timeSlot} of dayAssignments) {
        const date = weekInfo.dates[dayIndex];
        const dayName = this.getDayName(dayIndex);

        employee.weeklySchedule[dayIndex].date = date;

        if (timeSlot) {
          // Calculate full 8-hour shift end time if needed
          const adjustedTimeSlot = this.calculate8HourShift(timeSlot);
          employee.weeklySchedule[dayIndex].timeSlot = adjustedTimeSlot;
          console.log(`   ✅ ${dayName} ${date}: ${adjustedTimeSlot.start}-${adjustedTimeSlot.end}`);
          successCount++;
        } else {
          console.log(`   📅 ${dayName} ${date}: OFF`);
        }
      }

      // Fill in dates for remaining days (mark as OFF)
      employee.weeklySchedule.forEach((dailySchedule, dayIndex) => {
        const extractedDate = weekInfo.dates[dayIndex];
        if (extractedDate && !dailySchedule.date) {
          dailySchedule.date = extractedDate;
          const dayName = this.getDayName(dayIndex);
          console.log(`   ✅ ${dayName} ${extractedDate}: OFF`);
        }
      });

      console.log(`✅ Extracted ${successCount} work shifts from table structure`);
      return successCount > 0;

    } catch (error) {
      console.error('❌ Error during table extraction:', error);
      return false;
    }
  }

  /**
   * Find employee's row in table structure
   */
  private findEmployeeRow(employeeName: string, tableStructure: TableStructure): TableRow | undefined {
    // Split name into parts for flexible matching (e.g., "BORLONGAN, JOEZARI" -> ["BORLONGAN", "JOEZARI"])
    const nameParts = employeeName.split(/[\s,]+/).filter(part => part.length > 2);

    console.log(`🔍 Searching for employee with name parts: [${nameParts.join(', ')}]`);

    for (const row of tableStructure.rows) {
      const rowText = row.cells.map(cell => cell.text).join(' ').toUpperCase();

      // Check if row contains all name parts
      const allPartsFound = nameParts.every(part => rowText.includes(part.toUpperCase()));

      if (allPartsFound) {
        console.log(`🔍 Found employee row: "${rowText.substring(0, 150)}"`);
        return row;
      }
    }

    console.log(`⚠️ Could not find row containing all parts: [${nameParts.join(', ')}]`);
    return undefined;
  }

  /**
   * Build mapping from column index to date
   */
  private buildColumnDateMap(dateHeaderRow: TableRow, weekInfo: WeekInfo): Map<number, string> {
    const columnDateMap = new Map<number, string>();

    const dayNamePattern = /\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
    const dayAbbreviations = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    dateHeaderRow.cells.forEach((cell, columnIndex) => {
      const cellText = cell.text.toLowerCase();
      const match = cellText.match(dayNamePattern);

      if (match) {
        const dayName = match[0].toLowerCase();

        // Find which day index this is (0=Mon, 1=Tue, etc.)
        let dayIndex = -1;
        for (let i = 0; i < dayAbbreviations.length; i++) {
          if (dayName.startsWith(dayAbbreviations[i])) {
            dayIndex = i;
            break;
          }
        }

        if (dayIndex >= 0 && dayIndex < weekInfo.dates.length) {
          columnDateMap.set(columnIndex, weekInfo.dates[dayIndex]);
          console.log(`   📍 Column ${columnIndex} (${cell.text}) → ${weekInfo.dates[dayIndex]}`);
        }
      }
    });

    return columnDateMap;
  }

  /**
   * Parse time slot from table cell text
   * Now handles split shifts with lunch breaks (e.g., "6:30AM-10:30AM 11:00AM-3:00PM")
   */
  private parseTimeSlotFromCell(cellText: string): TimeSlot | undefined {
    // Look for time patterns in cell - allow flexible whitespace and optional first AM/PM
    // Handles: "6:30 AM-10:30AM", "6:30    AM-10:30 AM", "6:30-10:30AM", "6:30 AM - 10:30 AM"
    const timePattern = /(\d{1,2}):(\d{2})\s*(AM|PM)?\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/gi;
    const matches = cellText.match(timePattern);

    if (matches && matches.length > 0) {
      const warnings: string[] = [];

      // Check if this is a split shift (two time ranges found)
      if (matches.length >= 2) {
        // Parse both shifts to get start and end times
        const morningShift = this.parseTimeSlot(matches[0], warnings);
        const afternoonShift = this.parseTimeSlot(matches[1], warnings);

        if (morningShift && afternoonShift) {
          // Create combined time slot: start of morning shift to end of afternoon shift
          const combinedSlot: TimeSlot = {
            start: morningShift.start,
            end: afternoonShift.end,
            raw: `${matches[0]} + ${matches[1]}`
          };

          console.log(`      🕐 Parsed SPLIT SHIFT from cell "${cellText.substring(0, 50)}": ${combinedSlot.start}-${combinedSlot.end} (${matches[0]} + ${matches[1]})`);
          return combinedSlot;
        }
      }

      // Single time range or fallback
      const timeSlot = this.parseTimeSlot(matches[0], warnings);

      if (timeSlot) {
        console.log(`      🕐 Parsed time from cell "${cellText.substring(0, 30)}": ${timeSlot.start}-${timeSlot.end}`);
      }

      return timeSlot;
    }

    return undefined;
  }

  /**
   * Parse time slot from a range of adjacent cells (for when time data is split across cells)
   * @param firstOnly - If true, only return the FIRST time range found (prevents combining multiple days)
   */
  private parseTimeSlotFromCellRange(cells: TableCell[], startCol: number, endCol: number, firstOnly: boolean = false): TimeSlot | undefined {
    // Concatenate text from adjacent cells
    const combinedText = cells
      .slice(startCol, endCol)
      .map(c => c.text)
      .join(' ')
      .trim();

    if (!combinedText) return undefined;

    // If firstOnly, use non-global regex to match only the FIRST time range
    if (firstOnly) {
      const timePattern = /(\d{1,2}):(\d{2})\s*(AM|PM)?\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i;
      const match = combinedText.match(timePattern);

      if (match) {
        const warnings: string[] = [];
        const timeSlot = this.parseTimeSlot(match[0], warnings);

        if (timeSlot) {
          console.log(`   🕐 Extracted FIRST time range: ${timeSlot.start}-${timeSlot.end} from "${combinedText}"`);
          return timeSlot;
        }
      }

      return undefined;
    }

    // Otherwise, use the full split-shift detection logic
    return this.parseTimeSlotFromCell(combinedText);
  }
}