import { TelegramFileManager } from "../../src/services/fileManager.js";
import { jest } from '@jest/globals';

// Mock console methods to reduce test noise
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('TelegramFileManager', () => {
  beforeEach(() => {
    // Mock environment for tests
    process.env.TELEGRAM_BOT_TOKEN = 'test_bot_token';
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
    it('should initialize successfully with valid token', () => {
      expect(() => new TelegramFileManager()).not.toThrow();
    });
  });
});