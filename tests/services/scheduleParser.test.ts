import { jest } from '@jest/globals';
import { ScheduleParser } from '../../src/services/scheduleParser.js';
import { DEFAULT_SCHEDULE_PARSING_CONFIG } from '../../src/types/schedule.js';
import type { ParsedSchedule } from '../../src/types/schedule.js';

// Mock console methods to reduce test noise
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('ScheduleParser', () => {
  let parser: ScheduleParser;

  beforeEach(() => {
    parser = new ScheduleParser();
    mockConsoleLog.mockClear();
    mockConsoleWarn.mockClear();
    mockConsoleError.mockClear();
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleWarn.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('Constructor and Configuration', () => {
    test('should create parser with default config', () => {
      expect(parser).toBeInstanceOf(ScheduleParser);
    });

    test('should create parser with custom config', () => {
      const customConfig = {
        ...DEFAULT_SCHEDULE_PARSING_CONFIG,
        minConfidenceThreshold: 0.9,
        maxHoursPerWeek: 60
      };
      
      const customParser = new ScheduleParser(customConfig);
      expect(customParser).toBeInstanceOf(ScheduleParser);
    });

    test('should update configuration', () => {
      const newConfig = { minConfidenceThreshold: 0.5 };
      parser.updateConfig(newConfig);
      // Should not throw
    });
  });

  describe('Schedule Parsing', () => {
    test('should parse simple employee schedule', async () => {
      const mockOCRText = `
        Mon 08/11/2025  Tue 08/12/2025  Wed 08/13/2025  Thu 08/14/2025  Fri 08/15/2025  Sat 08/16/2025  Sun 08/17/2025
        Meat
        COOK, JO    40.00    6:30AM-10:00AM    7:00AM-11:00AM    8:00AM-12:00PM    6:30AM-10:00AM    7:00AM-11:00AM    Day Off    Day Off
      `;

      const result = await parser.parseSchedule(mockOCRText, {
        confidence: 0.95,
        processingTime: 1000,
        engine: 'tesseract'
      });

      expect(result).toHaveProperty('weekInfo');
      expect(result).toHaveProperty('departments');
      expect(result).toHaveProperty('totalEmployees');
      expect(result).toHaveProperty('parseMetadata');
      expect(result.totalEmployees).toBeGreaterThan(0);
    });

    test('should handle multiple departments', async () => {
      const mockOCRText = `
        Mon 08/11/2025  Tue 08/12/2025  Wed 08/13/2025  Thu 08/14/2025  Fri 08/15/2025  Sat 08/16/2025  Sun 08/17/2025
        Meat
        COOK, JO    40.00    6:30AM-10:00AM    7:00AM-11:00AM
        Produce  
        SMITH, JANE    35.00    9:00AM-1:00PM    10:00AM-2:00PM
      `;

      const result = await parser.parseSchedule(mockOCRText, {
        confidence: 0.95,
        processingTime: 1000,
        engine: 'tesseract'
      });

      expect(Object.keys(result.departments)).toContain('Meat');
      expect(Object.keys(result.departments)).toContain('Produce');
      expect(result.totalEmployees).toBe(2);
    });

    test('should extract week information correctly', async () => {
      const mockOCRText = `
        Mon 08/11/2025  Tue 08/12/2025  Wed 08/13/2025  Thu 08/14/2025  Fri 08/15/2025  Sat 08/16/2025  Sun 08/17/2025
        Employee    Total    Mon    Tue    Wed    Thu    Fri    Sat    Sun
        TEST, USER    40.00    8:00AM-4:00PM    8:00AM-4:00PM    8:00AM-4:00PM    8:00AM-4:00PM    8:00AM-4:00PM
      `;

      const result = await parser.parseSchedule(mockOCRText, {
        confidence: 0.95,
        processingTime: 1000,
        engine: 'tesseract'
      });

      expect(result.weekInfo.weekStart).toBe('2025-08-11');
      expect(result.weekInfo.weekEnd).toBe('2025-08-17');
      expect(result.weekInfo.dates).toHaveLength(7);
      expect(result.weekInfo.dates[0]).toBe('2025-08-11');
      expect(result.weekInfo.dates[6]).toBe('2025-08-17');
    });

    test('should parse various time formats', async () => {
      const mockOCRText = `
        Mon 08/11/2025  Tue 08/12/2025  Wed 08/13/2025
        Employee    Total    Mon    Tue    Wed
        TEST, USER    24.00    6:30AM-2:30PM    10:00AM-6:00PM    8:00AM-4:00PM
      `;

      const result = await parser.parseSchedule(mockOCRText, {
        confidence: 0.95,
        processingTime: 1000,
        engine: 'tesseract'
      });

      const employee = Object.values(result.departments)[0]?.[0];
      expect(employee).toBeDefined();
      
      if (employee) {
        expect(employee.weeklySchedule[0].timeSlot?.start).toBe('06:30');
        expect(employee.weeklySchedule[0].timeSlot?.end).toBe('14:30');
        expect(employee.weeklySchedule[1].timeSlot?.start).toBe('10:00');
        expect(employee.weeklySchedule[1].timeSlot?.end).toBe('18:00');
      }
    });

    test('should handle empty or invalid input', async () => {
      await expect(parser.parseSchedule('', {
        confidence: 0.95,
        processingTime: 1000,
        engine: 'tesseract'
      })).rejects.toThrow();

      await expect(parser.parseSchedule('   ', {
        confidence: 0.95,
        processingTime: 1000,
        engine: 'tesseract'  
      })).rejects.toThrow();
    });

    test('should include parsing metadata', async () => {
      const mockOCRText = `
        Mon 08/11/2025  Tue 08/12/2025
        Employee    Total    Mon    Tue
        TEST, USER    16.00    8:00AM-4:00PM    Day Off
      `;

      const ocrMetadata = {
        confidence: 0.87,
        processingTime: 2500,
        engine: 'google-vision' as const
      };

      const result = await parser.parseSchedule(mockOCRText, ocrMetadata);

      expect(result.parseMetadata.confidence).toBe(0.87);
      expect(result.parseMetadata.ocrEngine).toBe('google-vision');
      expect(result.parseMetadata.processingTime).toBeGreaterThan(0);
      expect(Array.isArray(result.parseMetadata.warnings)).toBe(true);
      expect(Array.isArray(result.parseMetadata.errors)).toBe(true);
    });
  });

  describe('Employee Data Parsing', () => {
    test('should parse employee names correctly', async () => {
      const mockOCRText = `
        Mon 08/11/2025  Tue 08/12/2025
        Employee    Total    Mon    Tue
        COOK, JOHN    40.00    8:00AM-4:00PM    Day Off
        SMITH, JANE DOE    35.00    9:00AM-5:00PM    10:00AM-6:00PM
      `;

      const result = await parser.parseSchedule(mockOCRText, {
        confidence: 0.95,
        processingTime: 1000,
        engine: 'tesseract'
      });

      const employees = Object.values(result.departments)[0] || [];
      expect(employees.length).toBe(2);
      expect(employees[0].name).toBe('COOK, JOHN');
      expect(employees[1].name).toBe('SMITH, JANE DOE');
    });

    test('should parse total hours correctly', async () => {
      const mockOCRText = `
        Mon 08/11/2025  Tue 08/12/2025
        Employee    Total    Mon    Tue
        COOK, JOHN    40.00    8:00AM-4:00PM    Day Off  
        SMITH, JANE    35.5    9:00AM-1:00PM    10:00AM-6:00PM
        DOE, MARY    20    6:00AM-10:00AM    Day Off
      `;

      const result = await parser.parseSchedule(mockOCRText, {
        confidence: 0.95,
        processingTime: 1000,
        engine: 'tesseract'
      });

      const employees = Object.values(result.departments)[0] || [];
      expect(employees[0].totalHours).toBe(40.0);
      expect(employees[1].totalHours).toBe(35.5);
      expect(employees[2].totalHours).toBe(20);
    });

    test('should handle day off schedules', async () => {
      const mockOCRText = `
        Mon 08/11/2025  Tue 08/12/2025  Wed 08/13/2025
        Employee    Total    Mon    Tue    Wed
        COOK, JOHN    24.00    8:00AM-4:00PM    Day Off    8:00AM-4:00PM
      `;

      const result = await parser.parseSchedule(mockOCRText, {
        confidence: 0.95,
        processingTime: 1000,
        engine: 'tesseract'
      });

      const employee = Object.values(result.departments)[0]?.[0];
      expect(employee?.weeklySchedule[0].timeSlot).toBeDefined();
      expect(employee?.weeklySchedule[1].timeSlot).toBeUndefined(); // Day off
      expect(employee?.weeklySchedule[2].timeSlot).toBeDefined();
    });
  });

  describe('Time Slot Parsing', () => {
    test('should parse standard time formats', async () => {
      const mockOCRText = `
        Mon 08/11/2025
        Employee    Total    Mon
        TEST, USER    8.00    6:30AM-2:30PM
      `;

      const result = await parser.parseSchedule(mockOCRText, {
        confidence: 0.95,
        processingTime: 1000,
        engine: 'tesseract'
      });

      const timeSlot = Object.values(result.departments)[0]?.[0]?.weeklySchedule[0]?.timeSlot;
      expect(timeSlot?.start).toBe('06:30');
      expect(timeSlot?.end).toBe('14:30');
      expect(timeSlot?.raw).toBe('6:30AM-2:30PM');
    });

    test('should handle various time separators', async () => {
      const testCases = [
        { input: '8:00AM-4:00PM', expectedStart: '08:00', expectedEnd: '16:00' },
        { input: '8:00AM–4:00PM', expectedStart: '08:00', expectedEnd: '16:00' }, // en dash
        { input: '8:00 AM - 4:00 PM', expectedStart: '08:00', expectedEnd: '16:00' }, // spaces
      ];

      for (const testCase of testCases) {
        const mockOCRText = `
          Mon 08/11/2025
          Employee    Total    Mon
          TEST, USER    8.00    ${testCase.input}
        `;

        const result = await parser.parseSchedule(mockOCRText, {
          confidence: 0.95,
          processingTime: 1000,
          engine: 'tesseract'
        });

        const timeSlot = Object.values(result.departments)[0]?.[0]?.weeklySchedule[0]?.timeSlot;
        expect(timeSlot?.start).toBe(testCase.expectedStart);
        expect(timeSlot?.end).toBe(testCase.expectedEnd);
      }
    });

    test('should handle 12-hour to 24-hour conversion', async () => {
      const testCases = [
        { input: '6:00AM-2:00PM', expectedStart: '06:00', expectedEnd: '14:00' },
        { input: '10:30PM-6:30AM', expectedStart: '22:30', expectedEnd: '06:30' },
        { input: '12:00PM-11:59PM', expectedStart: '12:00', expectedEnd: '23:59' },
        { input: '12:00AM-11:59AM', expectedStart: '00:00', expectedEnd: '11:59' },
      ];

      for (const testCase of testCases) {
        const mockOCRText = `
          Mon 08/11/2025
          Employee    Total    Mon
          TEST, USER    8.00    ${testCase.input}
        `;

        const result = await parser.parseSchedule(mockOCRText, {
          confidence: 0.95,
          processingTime: 1000,
          engine: 'tesseract'
        });

        const timeSlot = Object.values(result.departments)[0]?.[0]?.weeklySchedule[0]?.timeSlot;
        expect(timeSlot?.start).toBe(testCase.expectedStart);
        expect(timeSlot?.end).toBe(testCase.expectedEnd);
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed OCR text gracefully', async () => {
      const mockOCRText = `
        Random text that doesn't look like a schedule
        No structure here
        123 456 789
      `;

      await expect(parser.parseSchedule(mockOCRText, {
        confidence: 0.95,
        processingTime: 1000,
        engine: 'tesseract'
      })).rejects.toThrow();
    });

    test('should collect parsing warnings', async () => {
      const mockOCRText = `
        Mon 08/11/2025
        Employee    Total    Mon
        INVALID_TIME_USER    8.00    25:99AM-30:00PM
      `;

      const result = await parser.parseSchedule(mockOCRText, {
        confidence: 0.95,
        processingTime: 1000,
        engine: 'tesseract'
      });

      expect(result.parseMetadata.warnings.length).toBeGreaterThan(0);
    });

    test('should handle low OCR confidence', async () => {
      const mockOCRText = `
        Mon 08/11/2025
        Employee    Total    Mon
        TEST, USER    8.00    8:00AM-4:00PM
      `;

      const result = await parser.parseSchedule(mockOCRText, {
        confidence: 0.3, // Low confidence
        processingTime: 1000,
        engine: 'tesseract'
      });

      expect(result.parseMetadata.confidence).toBe(0.3);
      // Should still parse but may have warnings
    });
  });
});