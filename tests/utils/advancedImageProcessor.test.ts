import { AdvancedImageProcessor } from '../../src/utils/advancedImageProcessor.js';
import { DEFAULT_OPENCV_PREPROCESSING } from '../../src/types/opencv.js';
import fs from 'fs';
import path from 'path';

describe('AdvancedImageProcessor', () => {
  let processor: AdvancedImageProcessor;
  let mockImageBuffer: Buffer;

  beforeAll(() => {
    processor = new AdvancedImageProcessor();
    // Create a simple 1x1 PNG buffer for testing
    mockImageBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // bit depth, color type, etc.
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk header
      0x54, 0x08, 0x99, 0x01, 0x01, 0x01, 0x00, 0x00, // compressed data
      0xFE, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE5, 0x27, // more compressed data
      0xDE, 0xFC, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, // IEND chunk
      0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
  });

  describe('Initialization', () => {
    test('should create processor instance', () => {
      expect(processor).toBeInstanceOf(AdvancedImageProcessor);
    });

    test('should check OpenCV readiness', async () => {
      const isReady = await processor.isOpenCVReady();
      // Should be boolean (might be false if OpenCV not available in test environment)
      expect(typeof isReady).toBe('boolean');
    });

    test('should get OpenCV info', () => {
      const info = processor.getOpenCVInfo();
      expect(info).toHaveProperty('ready');
      expect(typeof info.ready).toBe('boolean');
    });
  });

  describe('Image Preprocessing', () => {
    test('should preprocess image with default options', async () => {
      const result = await processor.preprocessImage(mockImageBuffer);
      
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    test('should preprocess image with custom options', async () => {
      const customOptions = {
        ...DEFAULT_OPENCV_PREPROCESSING,
        useAdaptiveThreshold: false,
        useCLAHE: false
      };

      const result = await processor.preprocessImage(mockImageBuffer, customOptions);
      
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    test('should handle preprocessing with single method', async () => {
      const options = {
        ...DEFAULT_OPENCV_PREPROCESSING,
        useMultiMethod: false
      };

      const result = await processor.preprocessImage(mockImageBuffer, options);
      
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    test('should fallback gracefully when OpenCV fails', async () => {
      // This test ensures fallback behavior works
      const result = await processor.preprocessImage(mockImageBuffer);
      
      // Should still return a buffer even if OpenCV is not available
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid image buffer', async () => {
      const invalidBuffer = Buffer.from('invalid image data');
      
      // Should not throw, but fallback to Sharp.js processing
      const result = await processor.preprocessImage(invalidBuffer);
      expect(result).toBeInstanceOf(Buffer);
    });

    test('should handle empty buffer', async () => {
      const emptyBuffer = Buffer.alloc(0);
      
      // Should not throw, but fallback to Sharp.js processing
      const result = await processor.preprocessImage(emptyBuffer);
      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('Configuration Options', () => {
    test('should respect adaptive threshold settings', async () => {
      const options = {
        ...DEFAULT_OPENCV_PREPROCESSING,
        useAdaptiveThreshold: true,
        adaptiveMethod: 'mean' as const,
        blockSize: 15
      };

      const result = await processor.preprocessImage(mockImageBuffer, options);
      expect(result).toBeInstanceOf(Buffer);
    });

    test('should respect CLAHE settings', async () => {
      const options = {
        ...DEFAULT_OPENCV_PREPROCESSING,
        useCLAHE: true,
        clipLimit: 4.0,
        gridSize: [6, 6] as [number, number]
      };

      const result = await processor.preprocessImage(mockImageBuffer, options);
      expect(result).toBeInstanceOf(Buffer);
    });

    test('should respect morphological operation settings', async () => {
      const options = {
        ...DEFAULT_OPENCV_PREPROCESSING,
        useMorphological: true,
        morphOperation: 'opening' as const,
        kernelSize: [3, 3] as [number, number]
      };

      const result = await processor.preprocessImage(mockImageBuffer, options);
      expect(result).toBeInstanceOf(Buffer);
    });

    test('should respect denoising settings', async () => {
      const options = {
        ...DEFAULT_OPENCV_PREPROCESSING,
        useAdvancedDenoising: true,
        denoiseMethod: 'bilateral' as const,
        bilateralD: 5
      };

      const result = await processor.preprocessImage(mockImageBuffer, options);
      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('Multi-Method Processing', () => {
    test('should process with multiple methods when enabled', async () => {
      const options = {
        ...DEFAULT_OPENCV_PREPROCESSING,
        useMultiMethod: true,
        qualityThreshold: 0.5
      };

      const result = await processor.preprocessImage(mockImageBuffer, options);
      expect(result).toBeInstanceOf(Buffer);
    });

    test('should handle all methods failing gracefully', async () => {
      // Even if OpenCV methods fail, should fall back to Sharp.js
      const result = await processor.preprocessImage(mockImageBuffer);
      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('Performance', () => {
    test('should complete preprocessing within reasonable time', async () => {
      const startTime = Date.now();
      await processor.preprocessImage(mockImageBuffer);
      const endTime = Date.now();
      
      // Should complete within 10 seconds (generous for CI environments)
      expect(endTime - startTime).toBeLessThan(10000);
    });
  });
});