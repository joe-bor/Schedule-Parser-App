import { OCRProcessor } from "../../src/services/ocrProcessor.js";
import { jest } from '@jest/globals';

// Mock console methods to reduce test noise
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

describe('OCRProcessor', () => {
  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleWarn.mockRestore();
  });

  describe('constructor', () => {
    it('should create OCRProcessor instance', () => {
      expect(() => new OCRProcessor()).not.toThrow();
    });

    it('should have expected methods', () => {
      const ocrProcessor = new OCRProcessor();
      expect(typeof ocrProcessor.extractText).toBe('function');
      expect(typeof ocrProcessor.terminate).toBe('function');
      expect(typeof ocrProcessor.isWorkerReady).toBe('function');
    });

    it('should have static cleanup method', () => {
      expect(typeof OCRProcessor.cleanup).toBe('function');
    });
  });

  describe('worker status', () => {
    it('should report worker not ready initially', async () => {
      const ocrProcessor = new OCRProcessor();
      expect(await ocrProcessor.isWorkerReady()).toBe(false);
    });

    it('should provide worker info when not initialized', async () => {
      const ocrProcessor = new OCRProcessor();
      const info = await ocrProcessor.getWorkerInfo();
      expect(info.initialized).toBe(false);
    });
  });

  describe('termination', () => {
    it('should handle termination when worker is not initialized', async () => {
      const ocrProcessor = new OCRProcessor();
      await expect(ocrProcessor.terminate()).resolves.not.toThrow();
    });
  });
});