import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

// Rate limit for general API endpoints
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per windowMs
  message: { error: "Too many requests from this IP, please try again later" },
});

// Specific limiter for Telegram webhook
// More permissive as it's called by Telegram servers
export const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 100, // Telegram can send multiple updates quickly
  message: { error: "Too many webhook requests" },
});
