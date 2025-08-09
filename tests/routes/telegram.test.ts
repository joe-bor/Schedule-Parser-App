import request from "supertest";
import createApp from "../../src/app.js";
import { jest } from '@jest/globals';
import { createMockFetchResponse } from "../types/test-utils.js";
import type { 
  TelegramUpdate, 
  TelegramApiResponse, 
  TelegramSendMessageResponse
} from "../../src/types/telegram.js";

// Mock console methods to avoid test noise
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe("Telegram Routes", () => {
  let app: ReturnType<typeof createApp>;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    app = createApp();
    
    // Mock fetch for each test
    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = mockFetch;
    
    mockConsoleLog.mockClear();
    mockConsoleError.mockClear();

    // Mock environment variables
    process.env.TELEGRAM_BOT_TOKEN = "test_bot_token";
    process.env.TELEGRAM_WEBHOOK_URL = "https://test.example.com/webhook";
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_URL;
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
  });

  describe("POST /api/telegram/webhook", () => {
    it("should handle text message successfully", async () => {
      // Mock successful sendMessage response
      const sendMessageResponse: TelegramApiResponse<TelegramSendMessageResponse> = {
        ok: true,
        result: {
          message_id: 123,
          from: { id: 1, is_bot: true, first_name: "TestBot" },
          chat: { id: 987654321, type: "private" },
          date: 1640995201,
          text: 'You said: "Hello bot"'
        }
      };
      
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(sendMessageResponse)
      );

      const telegramUpdate: TelegramUpdate = {
        update_id: 123456789,
        message: {
          message_id: 1,
          from: {
            id: 987654321,
            first_name: "Test",
            username: "testuser"
          },
          chat: {
            id: 987654321,
            type: "private"
          },
          date: 1640995200,
          text: "Hello bot"
        }
      };

      const response = await request(app)
        .post("/api/telegram/webhook")
        .send(telegramUpdate);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ok: true,
        message: "Webhook received successfully"
      });

      // Verify sendMessage was called
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bot/test_bot_token/sendMessage",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: 987654321,
            text: 'You said: "Hello bot"',
            parse_mode: "HTML"
          })
        })
      );
    });

    it("should handle photo message successfully", async () => {
      // Mock successful sendMessage response
      const photoResponse: TelegramApiResponse<TelegramSendMessageResponse> = {
        ok: true,
        result: {
          message_id: 123,
          from: { id: 1, is_bot: true, first_name: "TestBot" },
          chat: { id: 987654321, type: "private" },
          date: 1640995201,
          text: "📸 I received your photo! OCR processing will be implemented soon."
        }
      };
      
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(photoResponse)
      );

      const telegramUpdate = {
        update_id: 123456790,
        message: {
          message_id: 2,
          from: {
            id: 987654321,
            first_name: "Test"
          },
          chat: {
            id: 987654321,
            type: "private"
          },
          date: 1640995300,
          photo: [
            { file_id: "photo_small", width: 90, height: 67 },
            { file_id: "photo_large", width: 1280, height: 960 }
          ],
          caption: "My schedule"
        }
      };

      const response = await request(app)
        .post("/api/telegram/webhook")
        .send(telegramUpdate);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ok: true,
        message: "Webhook received successfully"
      });

      // Verify sendMessage was called with photo acknowledgment
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bot/test_bot_token/sendMessage",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: 987654321,
            text: "📸 I received your photo! OCR processing will be implemented soon.",
            parse_mode: "HTML"
          })
        })
      );
    });

    it("should handle document message successfully", async () => {
      const telegramUpdate = {
        update_id: 123456791,
        message: {
          message_id: 3,
          from: {
            id: 987654321,
            first_name: "Test"
          },
          chat: {
            id: 987654321,
            type: "private"
          },
          date: 1640995400,
          document: {
            file_id: "doc123",
            file_name: "schedule.pdf"
          }
        }
      };

      const response = await request(app)
        .post("/api/telegram/webhook")
        .send(telegramUpdate);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ok: true,
        message: "Webhook received successfully"
      });

      // Should log document info but not send response for documents
      expect(mockConsoleLog).toHaveBeenCalledWith("📎 Document:", "schedule.pdf");
    });

    it("should handle edited message", async () => {
      const telegramUpdate = {
        update_id: 123456792,
        edited_message: {
          message_id: 1,
          from: {
            id: 987654321,
            first_name: "Test"
          },
          chat: {
            id: 987654321,
            type: "private"
          },
          date: 1640995200,
          edit_date: 1640995500,
          text: "Hello bot (edited)"
        }
      };

      const response = await request(app)
        .post("/api/telegram/webhook")
        .send(telegramUpdate);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ok: true,
        message: "Webhook received successfully"
      });

      expect(mockConsoleLog).toHaveBeenCalledWith("✏️ Message edited");
    });

    it("should handle callback query", async () => {
      const telegramUpdate = {
        update_id: 123456793,
        callback_query: {
          id: "callback123",
          from: {
            id: 987654321,
            first_name: "Test"
          },
          message: {
            message_id: 1,
            chat: {
              id: 987654321,
              type: "private"
            },
            date: 1640995200
          },
          data: "button_clicked"
        }
      };

      const response = await request(app)
        .post("/api/telegram/webhook")
        .send(telegramUpdate);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ok: true,
        message: "Webhook received successfully"
      });

      expect(mockConsoleLog).toHaveBeenCalledWith("🔘 Callback query:", "button_clicked");
    });

    it("should return 400 for invalid webhook data", async () => {
      const response = await request(app)
        .post("/api/telegram/webhook")
        .send({ invalid: "data" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: "Missing update_id"
      });
    });

    it("should handle sendMessage failure gracefully", async () => {
      // Mock failed sendMessage response
      const errorResponse: TelegramApiResponse = {
        ok: false, 
        error_code: 400,
        description: "Chat not found" 
      };
      
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(errorResponse, false)
      );

      const telegramUpdate = {
        update_id: 123456794,
        message: {
          message_id: 1,
          from: { id: 987654321, first_name: "Test" },
          chat: { id: 987654321, type: "private" },
          date: 1640995200,
          text: "Hello"
        }
      };

      const response = await request(app)
        .post("/api/telegram/webhook")
        .send(telegramUpdate);

      // Should still return success (webhook processing succeeded)
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ok: true,
        message: "Webhook received successfully"
      });

      // Should log the error
      expect(mockConsoleError).toHaveBeenCalledWith(
        "❌ Failed to send message to chat 987654321:",
        { ok: false, error_code: 400, description: "Chat not found" }
      );
    });
  });

  describe("POST /api/telegram/setup", () => {
    it("should set webhook successfully", async () => {
      // Mock successful webhook setup response
      const webhookResponse: TelegramApiResponse<boolean> = {
        ok: true,
        result: true,
        description: "Webhook was set"
      };
      
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(webhookResponse)
      );

      const response = await request(app)
        .post("/api/telegram/setup");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        webhook_url: "https://test.example.com/webhook",
        result: {
          ok: true,
          result: true,
          description: "Webhook was set"
        }
      });

      // Verify correct API call was made
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bot/test_bot_token/setWebhook",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: "https://test.example.com/webhook",
            allowed_updates: ["message", "edited_message", "callback_query"]
          })
        }
      );
    });

    it("should handle webhook setup failure", async () => {
      // Mock failed webhook setup response
      const failureResponse: TelegramApiResponse = {
        ok: false,
        error_code: 400,
        description: "Bad Request: bad webhook: Webhook can be set up only on ports 80, 88, 443 or 8443"
      };
      
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(failureResponse, false)
      );

      const response = await request(app)
        .post("/api/telegram/setup");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: "Failed to set webhook",
        details: {
          ok: false,
          error_code: 400,
          description: "Bad Request: bad webhook: Webhook can be set up only on ports 80, 88, 443 or 8443"
        }
      });
    });

    it("should return 400 when bot token is missing", async () => {
      delete process.env.TELEGRAM_BOT_TOKEN;

      const response = await request(app)
        .post("/api/telegram/setup");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: "TELEGRAM_BOT_TOKEN not configured"
      });
    });

    it("should return 400 when webhook URL is missing", async () => {
      delete process.env.TELEGRAM_WEBHOOK_URL;

      const response = await request(app)
        .post("/api/telegram/setup");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: "TELEGRAM_WEBHOOK_URL not configured"
      });
    });

    it("should handle network errors gracefully", async () => {
      // Mock network error
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const response = await request(app)
        .post("/api/telegram/setup");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: "Internal server error during webhook setup"
      });
    });

    it("should add https prefix to webhook URL if missing", async () => {
      process.env.TELEGRAM_WEBHOOK_URL = "test.example.com/webhook";

      const httpsResponse: TelegramApiResponse<boolean> = {
        ok: true,
        result: true,
        description: "Webhook was set"
      };
      
      mockFetch.mockResolvedValueOnce(
        createMockFetchResponse(httpsResponse)
      );

      await request(app).post("/api/telegram/setup");

      // Should have added https prefix
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.telegram.org/bot/test_bot_token/setWebhook",
        expect.objectContaining({
          body: JSON.stringify({
            url: "https://test.example.com/webhook",
            allowed_updates: ["message", "edited_message", "callback_query"]
          })
        })
      );
    });
  });
});