import type { Request, NextFunction } from "express";
import { validateWebhook } from "../../src/middleware/validateWebhook.js";
import { jest } from '@jest/globals';
import { createMockResponse } from "../types/test-utils.js";
import type { TelegramUpdate } from "../../src/types/telegram.js";

describe("validateWebhook middleware", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: ReturnType<typeof createMockResponse>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      body: {}
    };
    mockResponse = createMockResponse();
    mockNext = jest.fn();
  });

  it("should call next() for valid Telegram update", () => {
    const validUpdate: TelegramUpdate = {
      update_id: 123456789,
      message: {
        message_id: 1,
        from: { id: 123, first_name: "Test" },
        chat: { id: 123, type: "private" },
        date: 1640995200,
        text: "Hello"
      }
    };
    
    mockRequest.body = validUpdate;

    validateWebhook(
      mockRequest as Request,
      mockResponse as any,
      mockNext
    );

    expect(mockNext).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
    expect(mockResponse.json).not.toHaveBeenCalled();
  });

  it("should return 400 for null/undefined body", () => {
    mockRequest.body = null;

    validateWebhook(
      mockRequest as Request,
      mockResponse as any,
      mockNext
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "Invalid update format"
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should return 400 for non-object body", () => {
    mockRequest.body = "not an object";

    validateWebhook(
      mockRequest as Request,
      mockResponse as any,
      mockNext
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "Invalid update format"
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should return 400 for missing update_id", () => {
    mockRequest.body = {
      message: {
        message_id: 1,
        from: { id: 123, first_name: "Test" },
        chat: { id: 123, type: "private" },
        date: 1640995200,
        text: "Hello"
      }
    };

    validateWebhook(
      mockRequest as Request,
      mockResponse as any,
      mockNext
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "Missing update_id"
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should return 400 for update_id of 0 (falsy value)", () => {
    mockRequest.body = {
      update_id: 0,
      message: {
        message_id: 1,
        from: { id: 123, first_name: "Test" },
        chat: { id: 123, type: "private" },
        date: 1640995200,
        text: "Hello"
      }
    };

    validateWebhook(
      mockRequest as Request,
      mockResponse as any,
      mockNext
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "Missing update_id"
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should accept update with just update_id (minimal valid update)", () => {
    mockRequest.body = {
      update_id: 123456789
    };

    validateWebhook(
      mockRequest as Request,
      mockResponse as any,
      mockNext
    );

    expect(mockNext).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
    expect(mockResponse.json).not.toHaveBeenCalled();
  });
});