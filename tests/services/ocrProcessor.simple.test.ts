import { jest } from '@jest/globals';

describe('OCRProcessor', () => {
  it('should be importable without errors', async () => {
    // This tests that the module structure is correct without complex mocking
    const { OCRProcessor } = await import('../../src/services/ocrProcessor.js');
    expect(OCRProcessor).toBeDefined();
    expect(typeof OCRProcessor).toBe('function');
  });

  it('should create OCRProcessor instance', async () => {
    const { OCRProcessor } = await import('../../src/services/ocrProcessor.js');
    expect(() => new OCRProcessor()).not.toThrow();
  });

  it('should have expected methods', async () => {
    const { OCRProcessor } = await import('../../src/services/ocrProcessor.js');
    const processor = new OCRProcessor();
    
    expect(typeof processor.extractText).toBe('function');
    expect(typeof processor.terminate).toBe('function');
    expect(typeof processor.isWorkerReady).toBe('function');
    expect(typeof processor.getWorkerInfo).toBe('function');
  });

  it('should have static cleanup method', async () => {
    const { OCRProcessor } = await import('../../src/services/ocrProcessor.js');
    expect(typeof OCRProcessor.cleanup).toBe('function');
  });
});