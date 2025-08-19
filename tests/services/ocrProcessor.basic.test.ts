import { jest } from '@jest/globals';

// Mock all dependencies before importing
jest.mock('tesseract.js');
jest.mock('../../src/config/env.js');
jest.mock('../../src/services/googleVisionProcessor.js');
jest.mock('../../src/utils/imageProcessor.js');
jest.mock('../../src/utils/advancedImageProcessor.js');

describe('OCRProcessor Basic Tests', () => {
  beforeAll(() => {
    // Set up environment variables for tests
    process.env.NODE_ENV = 'test';
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  });

  it('should be importable without throwing errors', async () => {
    const { OCRProcessor } = await import('../../src/services/ocrProcessor.js');
    expect(OCRProcessor).toBeDefined();
    expect(typeof OCRProcessor).toBe('function');
  });

  it('should have expected static methods', async () => {
    const { OCRProcessor } = await import('../../src/services/ocrProcessor.js');
    expect(typeof OCRProcessor.cleanup).toBe('function');
  });

  it('should create instance without immediate initialization', async () => {
    const { OCRProcessor } = await import('../../src/services/ocrProcessor.js');
    expect(() => new OCRProcessor()).not.toThrow();
  });
});