import { jest } from '@jest/globals';
import type { OCRResult, ProcessingError, OCRConfig } from "../../src/types/ocr.js";

// Mock tesseract.js BEFORE importing OCRProcessor
const mockWorker = {
  loadLanguage: jest.fn(),
  initialize: jest.fn(), 
  setParameters: jest.fn(),
  recognize: jest.fn(),
  terminate: jest.fn()
};

const mockCreateWorker = jest.fn().mockResolvedValue(mockWorker);

jest.mock('tesseract.js', () => ({
  createWorker: mockCreateWorker
}), { virtual: true });

// Import AFTER mock is set up
import { OCRProcessor } from "../../src/services/ocrProcessor.js";

// Mock console methods to reduce test noise
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

describe('OCRProcessor', () => {
  let ocrProcessor: OCRProcessor;

  beforeEach(() => {
    ocrProcessor = new OCRProcessor();
    
    // Reset all mocks
    jest.clearAllMocks();
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
    mockConsoleWarn.mockClear();
    
    // Setup default mock behavior
    mockWorker.loadLanguage.mockResolvedValue(undefined);
    mockWorker.initialize.mockResolvedValue(undefined);
    mockWorker.setParameters.mockResolvedValue(undefined);
    mockWorker.terminate.mockResolvedValue(undefined);
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockConsoleWarn.mockRestore();
  });

  describe('extractText', () => {
    const mockImageBuffer = Buffer.from('fake image data');

    beforeEach(() => {
      // Default successful OCR response
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: 'Sample extracted text\nLine 2 of text',
          confidence: 85.5
        }
      });
    });

    it('should successfully extract text from image', async () => {
      const result = await ocrProcessor.extractText(mockImageBuffer);

      expect(result).toMatchObject({
        text: 'Sample extracted text\nLine 2 of text',
        confidence: 0.855, // Converted from 85.5% to 0.855
        processingTime: expect.any(Number)
      });

      expect(result.processingTime).toBeGreaterThan(0);
    });

    it('should initialize worker on first use', async () => {
      await ocrProcessor.extractText(mockImageBuffer);

      expect(mockCreateWorker).toHaveBeenCalledWith('eng');
      expect(mockWorker.setParameters).toHaveBeenCalledWith({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,:-/()[]{}',
        tessedit_pageseg_mode: '1',
        preserve_interword_spaces: '1'
      });
    });

    it('should reuse initialized worker on subsequent calls', async () => {
      // First call
      await ocrProcessor.extractText(mockImageBuffer);
      
      // Second call
      await ocrProcessor.extractText(mockImageBuffer);

      // Worker initialization should only happen once
      expect(mockCreateWorker).toHaveBeenCalledTimes(1);
      
      // But recognize should be called twice
      expect(mockWorker.recognize).toHaveBeenCalledTimes(2);
    });

    it('should handle custom OCR configuration', async () => {
      const customConfig: OCRConfig = {
        lang: 'fra',
        minConfidence: 0.5,
        timeoutMs: 10000
      };

      await ocrProcessor.extractText(mockImageBuffer, customConfig);

      expect(mockCreateWorker).toHaveBeenCalledWith('fra');
    });

    it('should warn when confidence is below threshold', async () => {
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: 'Low confidence text',
          confidence: 25.0 // Below default 30% threshold
        }
      });

      const result = await ocrProcessor.extractText(mockImageBuffer);

      expect(result.confidence).toBe(0.25);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('OCR confidence 0.25 below threshold 0.3')
      );
    });

    it('should handle empty text results', async () => {
      mockWorker.recognize.mockResolvedValue({
        data: {
          text: '   \n  \t  ',  // Whitespace only
          confidence: 50.0
        }
      });

      const result = await ocrProcessor.extractText(mockImageBuffer);

      expect(result.text).toBe(''); // Should be trimmed to empty string
      expect(result.confidence).toBe(0.5);
    });

    it('should handle OCR processing errors', async () => {
      mockWorker.recognize.mockRejectedValue(new Error('Tesseract processing failed'));

      await expect(ocrProcessor.extractText(mockImageBuffer)).rejects.toMatchObject({
        code: 'OCR_FAILED',
        message: expect.stringContaining('OCR processing failed: Tesseract processing failed')
      } as ProcessingError);
    });

    it('should handle worker initialization errors', async () => {
      // Create new processor to test initialization failure
      const failingProcessor = new OCRProcessor();
      mockCreateWorker.mockRejectedValueOnce(new Error('Worker creation failed'));

      await expect(failingProcessor.extractText(mockImageBuffer)).rejects.toMatchObject({
        code: 'OCR_FAILED',
        message: expect.stringContaining('Failed to initialize OCR worker')
      } as ProcessingError);
    });

    it('should extract text without progress logging', async () => {
      await ocrProcessor.extractText(mockImageBuffer);

      expect(mockCreateWorker).toHaveBeenCalledWith('eng');
      expect(mockWorker.recognize).toHaveBeenCalled();
    });
  });

  describe('terminate', () => {
    it('should terminate worker successfully', async () => {
      // Initialize worker first
      await ocrProcessor.extractText(Buffer.from('test'));
      
      await ocrProcessor.terminate();

      expect(mockWorker.terminate).toHaveBeenCalled();
      expect(await ocrProcessor.isWorkerReady()).toBe(false);
    });

    it('should handle termination when worker is not initialized', async () => {
      // Should not throw error
      await expect(ocrProcessor.terminate()).resolves.not.toThrow();
      expect(mockWorker.terminate).not.toHaveBeenCalled();
    });

    it('should handle termination errors gracefully', async () => {
      // Initialize worker first
      await ocrProcessor.extractText(Buffer.from('test'));
      
      mockWorker.terminate.mockRejectedValue(new Error('Termination failed'));

      // Should not throw, just log error
      await expect(ocrProcessor.terminate()).resolves.not.toThrow();
      expect(mockConsoleError).toHaveBeenCalledWith(
        '❌ Error terminating Tesseract worker:',
        expect.any(Error)
      );
    });
  });

  describe('worker status methods', () => {
    it('should report worker not ready initially', async () => {
      expect(await ocrProcessor.isWorkerReady()).toBe(false);
    });

    it('should report worker ready after initialization', async () => {
      await ocrProcessor.extractText(Buffer.from('test'));
      expect(await ocrProcessor.isWorkerReady()).toBe(true);
    });

    it('should provide worker info when not initialized', async () => {
      const info = await ocrProcessor.getWorkerInfo();
      expect(info).toEqual({
        initialized: false,
        language: undefined
      });
    });

    it('should provide worker info when initialized', async () => {
      await ocrProcessor.extractText(Buffer.from('test'));
      
      const info = await ocrProcessor.getWorkerInfo();
      expect(info).toEqual({
        initialized: true,
        language: 'eng'
      });
    });
  });

  describe('cleanup static method', () => {
    it('should cleanup processor properly', async () => {
      // Initialize worker
      await ocrProcessor.extractText(Buffer.from('test'));
      
      await OCRProcessor.cleanup(ocrProcessor);

      expect(mockWorker.terminate).toHaveBeenCalled();
      expect(await ocrProcessor.isWorkerReady()).toBe(false);
    });
  });
});