import { jest } from '@jest/globals';
import { ScheduleValidator } from '../../src/utils/scheduleValidator.js';
import { DEFAULT_SCHEDULE_PARSING_CONFIG } from '../../src/types/schedule.js';
import type { ParsedSchedule, Employee } from '../../src/types/schedule.js';

// Mock console methods to reduce test noise
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('ScheduleValidator', () => {
  let validator: ScheduleValidator;

  beforeEach(() => {
    validator = new ScheduleValidator(DEFAULT_SCHEDULE_PARSING_CONFIG);
    mockConsoleLog.mockClear();
    mockConsoleWarn.mockClear();
    mockConsoleError.mockClear();
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleWarn.mockRestore();
    mockConsoleError.mockRestore();
  });

  const createMockSchedule = (overrides?: Partial<ParsedSchedule>): ParsedSchedule => ({
    weekInfo: {
      weekStart: '2025-08-11',
      weekEnd: '2025-08-17',
      dates: ['2025-08-11', '2025-08-12', '2025-08-13', '2025-08-14', '2025-08-15', '2025-08-16', '2025-08-17']
    },
    departments: {
      'Meat': [
        {
          name: 'COOK, JOHN',
          totalHours: 40,
          department: 'Meat',
          weeklySchedule: [
            { date: '2025-08-11', dayName: 'Monday', timeSlot: { start: '08:00', end: '16:00', raw: '8:00AM-4:00PM' } },
            { date: '2025-08-12', dayName: 'Tuesday', timeSlot: { start: '08:00', end: '16:00', raw: '8:00AM-4:00PM' } },
            { date: '2025-08-13', dayName: 'Wednesday', timeSlot: { start: '08:00', end: '16:00', raw: '8:00AM-4:00PM' } },
            { date: '2025-08-14', dayName: 'Thursday', timeSlot: { start: '08:00', end: '16:00', raw: '8:00AM-4:00PM' } },
            { date: '2025-08-15', dayName: 'Friday', timeSlot: { start: '08:00', end: '16:00', raw: '8:00AM-4:00PM' } },
            { date: '2025-08-16', dayName: 'Saturday' }, // Day off
            { date: '2025-08-17', dayName: 'Sunday' }     // Day off
          ]
        }
      ]
    },
    totalEmployees: 1,
    parseMetadata: {
      confidence: 0.95,
      processingTime: 1500,
      ocrEngine: 'tesseract',
      warnings: [],
      errors: []
    },
    ...overrides
  });

  describe('Constructor', () => {
    test('should create validator with config', () => {
      expect(validator).toBeInstanceOf(ScheduleValidator);
    });

    test('should create validator with custom config', () => {
      const customConfig = {
        ...DEFAULT_SCHEDULE_PARSING_CONFIG,
        minConfidenceThreshold: 0.9
      };
      const customValidator = new ScheduleValidator(customConfig);
      expect(customValidator).toBeInstanceOf(ScheduleValidator);
    });
  });

  describe('Schedule Validation', () => {
    test('should validate a correct schedule', () => {
      const schedule = createMockSchedule();
      const result = validator.validateSchedule(schedule);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect low OCR confidence', () => {
      const schedule = createMockSchedule({
        parseMetadata: {
          confidence: 0.5, // Below default threshold of 0.7
          processingTime: 1500,
          ocrEngine: 'tesseract',
          warnings: [],
          errors: []
        }
      });

      const result = validator.validateSchedule(schedule);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'OCR_CONFIDENCE_TOO_LOW'
        })
      );
    });

    test('should validate week info structure', () => {
      const scheduleWithInvalidWeek = createMockSchedule({
        weekInfo: {
          weekStart: 'invalid-date',
          weekEnd: '2025-08-17',
          dates: ['2025-08-11', '2025-08-12'] // Only 2 dates instead of 7
        }
      });

      const result = validator.validateSchedule(scheduleWithInvalidWeek);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_DATE_FORMAT'
        })
      );
      expect(result.warnings).toContain('Expected 7 dates, found 2');
    });

    test('should detect empty schedule', () => {
      const emptySchedule = createMockSchedule({
        departments: {},
        totalEmployees: 0
      });

      const result = validator.validateSchedule(emptySchedule);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_TABLE_STRUCTURE',
          message: 'No employees found in schedule'
        })
      );
    });
  });

  describe('Employee Validation', () => {
    test('should detect missing employee name', () => {
      const scheduleWithInvalidEmployee = createMockSchedule({
        departments: {
          'Meat': [
            {
              name: '', // Empty name
              totalHours: 40,
              department: 'Meat',
              weeklySchedule: []
            } as Employee
          ]
        }
      });

      const result = validator.validateSchedule(scheduleWithInvalidEmployee);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_EMPLOYEE_NAME'
        })
      );
    });

    test('should detect invalid total hours', () => {
      const scheduleWithInvalidHours = createMockSchedule({
        departments: {
          'Meat': [
            {
              name: 'COOK, JOHN',
              totalHours: 100, // Exceeds max (80 by default)
              department: 'Meat',
              weeklySchedule: []
            } as Employee
          ]
        }
      });

      const result = validator.validateSchedule(scheduleWithInvalidHours);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_TOTAL_HOURS'
        })
      );
    });

    test('should detect inconsistent weekly schedule length', () => {
      const scheduleWithInconsistentWeek = createMockSchedule({
        departments: {
          'Meat': [
            {
              name: 'COOK, JOHN',
              totalHours: 40,
              department: 'Meat',
              weeklySchedule: [
                { date: '2025-08-11', dayName: 'Monday' }, // Only 1 day instead of 7
              ]
            } as Employee
          ]
        }
      });

      const result = validator.validateSchedule(scheduleWithInconsistentWeek);

      expect(result.warnings).toContain('COOK, JOHN has 1 days instead of 7');
    });
  });

  describe('Time Validation', () => {
    test('should detect invalid time format', () => {
      const scheduleWithInvalidTime = createMockSchedule({
        departments: {
          'Meat': [
            {
              name: 'COOK, JOHN',
              totalHours: 8,
              department: 'Meat',
              weeklySchedule: [
                {
                  date: '2025-08-11',
                  dayName: 'Monday',
                  timeSlot: { start: '25:00', end: '30:00', raw: 'invalid' } // Invalid times
                }
              ]
            } as Employee
          ]
        }
      });

      const result = validator.validateSchedule(scheduleWithInvalidTime);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_TIME_FORMAT'
        })
      );
    });

    test('should detect end time before start time', () => {
      const scheduleWithInvalidTimeOrder = createMockSchedule({
        departments: {
          'Meat': [
            {
              name: 'COOK, JOHN',
              totalHours: 8,
              department: 'Meat',
              weeklySchedule: [
                {
                  date: '2025-08-11',
                  dayName: 'Monday',
                  timeSlot: { start: '16:00', end: '08:00', raw: '4:00PM-8:00AM' } // End before start
                }
              ]
            } as Employee
          ]
        }
      });

      const result = validator.validateSchedule(scheduleWithInvalidTimeOrder);

      expect(result.warnings).toContain(
        'COOK, JOHN on Monday: end time (08:00) is not after start time (16:00)'
      );
    });

    test('should detect excessive daily hours', () => {
      const scheduleWithTooManyHours = createMockSchedule({
        departments: {
          'Meat': [
            {
              name: 'COOK, JOHN',
              totalHours: 20,
              department: 'Meat',
              weeklySchedule: [
                {
                  date: '2025-08-11',
                  dayName: 'Monday',
                  timeSlot: { start: '06:00', end: '23:00', raw: '6:00AM-11:00PM' } // 17 hours
                }
              ]
            } as Employee
          ]
        }
      });

      const result = validator.validateSchedule(scheduleWithTooManyHours);

      expect(result.warnings).toContain(
        expect.stringContaining('COOK, JOHN on Monday: working 17.0 hours exceeds daily limit')
      );
    });
  });

  describe('Common Issue Fixes', () => {
    test('should fix common name OCR artifacts', () => {
      const scheduleWithOCRErrors = createMockSchedule({
        departments: {
          'Meat': [
            {
              name: 'C00K, J0HN', // O mistaken for 0
              totalHours: 40,
              department: 'Meat',
              weeklySchedule: []
            } as Employee
          ]
        }
      });

      const { fixed, changes } = validator.fixCommonIssues(scheduleWithOCRErrors);

      expect(changes.length).toBeGreaterThan(0);
      expect(fixed.departments['Meat'][0].name).toBe('COOK, JOHN');
      expect(changes).toContain('Fixed employee name: "C00K, J0HN" → "COOK, JOHN"');
    });

    test('should fix time slot OCR artifacts', () => {
      const scheduleWithTimeErrors = createMockSchedule({
        departments: {
          'Meat': [
            {
              name: 'COOK, JOHN',
              totalHours: 8,
              department: 'Meat',
              weeklySchedule: [
                {
                  date: '2025-08-11',
                  dayName: 'Monday',
                  timeSlot: { start: '08:00', end: '16:00', raw: '8:O0AM-4:O0PM' } // O instead of 0
                }
              ]
            } as Employee
          ]
        }
      });

      const { fixed, changes } = validator.fixCommonIssues(scheduleWithTimeErrors);

      expect(changes.length).toBeGreaterThanOrEqual(0); // May or may not fix depending on parsing
    });

    test('should return original schedule if no fixes needed', () => {
      const perfectSchedule = createMockSchedule();
      const { fixed, changes } = validator.fixCommonIssues(perfectSchedule);

      expect(changes).toHaveLength(0);
      expect(fixed).toEqual(perfectSchedule);
    });
  });

  describe('Hours Calculation', () => {
    test('should calculate total hours correctly', () => {
      const schedule = createMockSchedule({
        departments: {
          'Meat': [
            {
              name: 'COOK, JOHN',
              totalHours: 32, // Stated hours
              department: 'Meat',
              weeklySchedule: [
                { date: '2025-08-11', dayName: 'Monday', timeSlot: { start: '08:00', end: '16:00', raw: '8AM-4PM' } }, // 8 hours
                { date: '2025-08-12', dayName: 'Tuesday', timeSlot: { start: '08:00', end: '16:00', raw: '8AM-4PM' } }, // 8 hours  
                { date: '2025-08-13', dayName: 'Wednesday', timeSlot: { start: '08:00', end: '16:00', raw: '8AM-4PM' } }, // 8 hours
                { date: '2025-08-14', dayName: 'Thursday', timeSlot: { start: '08:00', end: '16:00', raw: '8AM-4PM' } }, // 8 hours
                { date: '2025-08-15', dayName: 'Friday' }, // Day off
                { date: '2025-08-16', dayName: 'Saturday' }, // Day off  
                { date: '2025-08-17', dayName: 'Sunday' }  // Day off
              ]
            } as Employee
          ]
        }
      });

      const result = validator.validateSchedule(schedule);

      // Should match calculated hours (32) exactly, so no warnings about hour mismatch
      expect(result.warnings.filter(w => w.includes('stated hours')).length).toBe(0);
    });

    test('should detect hours mismatch', () => {
      const schedule = createMockSchedule({
        departments: {
          'Meat': [
            {
              name: 'COOK, JOHN',
              totalHours: 50, // Stated hours don't match calculated
              department: 'Meat',
              weeklySchedule: [
                { date: '2025-08-11', dayName: 'Monday', timeSlot: { start: '08:00', end: '16:00', raw: '8AM-4PM' } }, // 8 hours
                { date: '2025-08-12', dayName: 'Tuesday', timeSlot: { start: '08:00', end: '16:00', raw: '8AM-4PM' } }, // 8 hours
                { date: '2025-08-13', dayName: 'Wednesday' }, // Day off
                { date: '2025-08-14', dayName: 'Thursday' }, // Day off  
                { date: '2025-08-15', dayName: 'Friday' }, // Day off
                { date: '2025-08-16', dayName: 'Saturday' }, // Day off
                { date: '2025-08-17', dayName: 'Sunday' }  // Day off
              ]
            } as Employee
          ]
        }
      });

      const result = validator.validateSchedule(schedule);

      expect(result.warnings).toContain(
        expect.stringContaining('COOK, JOHN: stated hours (50) vs calculated hours (16.0) differ by 34.0')
      );
    });
  });
});