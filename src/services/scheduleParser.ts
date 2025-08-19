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

      // Step 4: Group employees by department
      const departments = this.groupEmployeesByDepartment(rowResults);
      console.log(`🏢 Found departments: ${Object.keys(departments).join(', ')}`);

      // Step 5: Calculate totals and validate
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
        dayNames.push(dayName);
        
        // Convert MM/DD/YYYY to YYYY-MM-DD
        const dateParts = dateStr.split('/');
        if (dateParts.length === 3) {
          const [month, day, year] = dateParts;
          const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          dates.push(isoDate);
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
        dates.push(date.toISOString().split('T')[0]);
      }
    }

    // Ensure we have exactly 7 dates (Mon-Sun)
    while (dates.length < 7) {
      const lastDate = new Date(dates[dates.length - 1]);
      lastDate.setDate(lastDate.getDate() + 1);
      dates.push(lastDate.toISOString().split('T')[0]);
    }

    return {
      weekStart: dates[0],
      weekEnd: dates[6],
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
    
    // Split by multiple spaces or tabs to separate columns
    const columns = line.split(/\s{2,}|\t+/).filter(col => col.trim().length > 0);
    
    if (columns.length < 3) {
      warnings.push('Insufficient columns for employee row');
      return null;
    }

    // Extract employee name (first column)
    const name = this.cleanEmployeeName(columns[0]);
    if (!name) {
      warnings.push('Could not extract employee name');
      return null;
    }

    // Extract total hours (second column)  
    const totalHours = this.parseTotalHours(columns[1]);
    if (totalHours === null) {
      warnings.push('Could not parse total hours');
    }

    // Parse daily schedules (remaining columns)
    const weeklySchedule: DailySchedule[] = [];
    
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const columnIndex = dayIndex + 2; // Skip name and total columns
      const timeText = columnIndex < columns.length ? columns[columnIndex] : '';
      
      const dailySchedule: DailySchedule = {
        date: weekInfo.dates[dayIndex],
        dayName: this.getDayName(dayIndex),
        timeSlot: this.parseTimeSlot(timeText, warnings)
      };
      
      weeklySchedule.push(dailySchedule);
    }

    return {
      name,
      totalHours: totalHours || 0,
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
    if (match) {
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
        
        if (!departments[employee.department]) {
          departments[employee.department] = [];
        }
        
        departments[employee.department].push(employee);
      }
    }
    
    return departments;
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
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Updated schedule parsing configuration');
  }
}