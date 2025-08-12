import { TelegramFileManager } from "../../src/services/fileManager.js";
import { jest } from '@jest/globals';
import { createMockFetchResponse } from "../types/test-utils.js";
import type { TelegramFileInfo, ProcessingError, FileValidationOptions } from "../../src/types/ocr.js";

// Mock console methods to reduce test noise
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('TelegramFileManager', () => {
  let fileManager: TelegramFileManager;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    // Mock environment
    process.env.TELEGRAM_BOT_TOKEN = 'test_bot_token';
    
    // Mock fetch
    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = mockFetch;
    
    fileManager = new TelegramFileManager();
    
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe('constructor', () => {
    it('should throw error when TELEGRAM_BOT_TOKEN is missing', () => {
      delete process.env.TELEGRAM_BOT_TOKEN;
      
      expect(() => new TelegramFileManager()).toThrow(
        'TELEGRAM_BOT_TOKEN is required for file operations'
      );
    });

    it('should initialize successfully with valid token', () => {
      expect(() => new TelegramFileManager()).not.toThrow();
    });
  });

  describe('getFileInfo', () => {
    it('should successfully get file information', async () => {
      const mockResponse = {
        ok: true,
        result: {
          file_id: 'test_file_id',
          file_unique_id: 'unique_123',
          file_size: 1024,
          file_path: 'photos/file_123.jpg'
        }
      };

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockResponse));

      const result = await fileManager.getFileInfo('test_file_id');

      expect(result).toEqual({
        file_id: 'test_file_id',
        file_unique_id: 'unique_123',
        file_size: 1024,
        file_path: 'photos/file_123.jpg'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.telegram.org/bottest_bot_token/getFile',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_id: 'test_file_id' })
        }
      );
    });

    it('should handle Telegram API errors', async () => {
      const mockResponse = {
        ok: false,
        description: 'File not found'
      };

      mockFetch.mockResolvedValueOnce(createMockFetchResponse(mockResponse, false));

      await expect(fileManager.getFileInfo('invalid_file_id')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        message: expect.stringContaining('Telegram API error: 400 Bad Request')
      });
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(fileManager.getFileInfo('test_file_id')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        message: expect.stringContaining('Network timeout')
      });
    });
  });

  describe('downloadPhoto', () => {
    const mockFileInfo: TelegramFileInfo = {
      file_id: 'test_file_id',
      file_unique_id: 'unique_123',
      file_size: 1024,
      file_path: 'photos/file_123.jpg'
    };

    const mockImageBuffer = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,  // JPEG header
      0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,  // JPEG data
      0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43   // More JPEG data
    ]);

    beforeEach(() => {
      // Reset mocks for each test
      mockFetch.mockReset();
    });

    it('should successfully download and validate photo', async () => {
      // Mock getFile API call (first fetch)
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({
        ok: true,
        result: mockFileInfo
      }));
      
      // Mock file download (second fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockImageBuffer.buffer)
      } as Response);

      const result = await fileManager.downloadPhoto('test_file_id');

      expect(result).toMatchObject({
        fileInfo: mockFileInfo,
        mimeType: 'image/jpeg'
      });
      expect(result.buffer).toBeInstanceOf(Buffer);

      // Verify both API calls were made
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should reject files that exceed size limit', async () => {
      const largeFileInfo = { ...mockFileInfo, file_size: 11 * 1024 * 1024 }; // 11MB

      // Mock both the getFileInfo call and a successful download response
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({
        ok: true,
        result: largeFileInfo
      }));
      // The implementation should reject before attempting download, but just in case:
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockImageBuffer.buffer)
      } as Response);

      const customOptions: FileValidationOptions = {
        maxSizeBytes: 10 * 1024 * 1024, // 10MB limit
        allowedMimeTypes: ['image/jpeg', 'image/png'],
        minWidth: 100,
        minHeight: 100
      };

      await expect(fileManager.downloadPhoto('test_file_id', customOptions))
        .rejects.toMatchObject({
          code: 'FILE_TOO_LARGE',
          message: expect.stringContaining('exceeds maximum')
        });
    });

    it('should reject unsupported file types', async () => {
      // Mock text file (not in allowed types)
      const textBuffer = Buffer.from('This is not an image file'); // Text content
      
      mockFetch.mockReset();
      // First call - getFileInfo
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({
        ok: true,
        result: mockFileInfo
      }));
      // Second call - downloadFileBuffer
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(textBuffer.buffer)
      } as Response);

      const customOptions: FileValidationOptions = {
        maxSizeBytes: 10 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg', 'image/png'], // Text files not allowed
        minWidth: 100,
        minHeight: 100
      };

      await expect(fileManager.downloadPhoto('test_file_id', customOptions))
        .rejects.toMatchObject({
          code: 'INVALID_FILE',
          message: expect.stringContaining('Unsupported file type')
        });
    });

    it('should handle missing file path', async () => {
      const invalidFileInfo = { ...mockFileInfo, file_path: undefined };

      // Override the first mock for this test
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(createMockFetchResponse({
        ok: true,
        result: invalidFileInfo
      }));

      await expect(fileManager.downloadPhoto('test_file_id'))
        .rejects.toMatchObject({
          code: 'INVALID_FILE',
          message: 'File path not available from Telegram API'
        });
    });

    it('should handle file download failures', async () => {
      // Mock failed file download (second call)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response);

      await expect(fileManager.downloadPhoto('test_file_id'))
        .rejects.toMatchObject({
          code: 'DOWNLOAD_FAILED',
          message: expect.stringContaining('404 Not Found')
        });
    });
  });

  describe('MIME type detection', () => {
    it('should detect JPEG files correctly', async () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      
      // Setup mocks for successful download
      mockFetch
        .mockResolvedValueOnce(createMockFetchResponse({
          ok: true,
          result: { file_id: 'test', file_unique_id: 'test', file_path: 'test.jpg' }
        }))
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(jpegBuffer.buffer)
        } as Response);

      const result = await fileManager.downloadPhoto('test_file_id');
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('should detect PNG files correctly', async () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      
      // Setup mocks for successful download
      mockFetch
        .mockResolvedValueOnce(createMockFetchResponse({
          ok: true,
          result: { file_id: 'test', file_unique_id: 'test', file_path: 'test.png' }
        }))
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(pngBuffer.buffer)
        } as Response);

      const result = await fileManager.downloadPhoto('test_file_id');
      expect(result.mimeType).toBe('image/png');
    });

    it('should detect WebP files correctly', async () => {
      const webpBuffer = Buffer.from('RIFF....WEBP', 'ascii');
      
      // Setup mocks for successful download
      mockFetch
        .mockResolvedValueOnce(createMockFetchResponse({
          ok: true,
          result: { file_id: 'test', file_unique_id: 'test', file_path: 'test.webp' }
        }))
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(webpBuffer.buffer)
        } as Response);

      const result = await fileManager.downloadPhoto('test_file_id');
      expect(result.mimeType).toBe('image/webp');
    });

    it('should return octet-stream for unknown formats', async () => {
      const unknownBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      
      // Setup mocks for successful download
      mockFetch
        .mockResolvedValueOnce(createMockFetchResponse({
          ok: true,
          result: { file_id: 'test', file_unique_id: 'test', file_path: 'test.unknown' }
        }))
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(unknownBuffer.buffer)
        } as Response);

      const result = await fileManager.downloadPhoto('test_file_id');
      expect(result.mimeType).toBe('application/octet-stream');
    });
  });
});