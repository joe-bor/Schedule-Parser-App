import { Router } from "express";
import { webhookLimiter } from "../middleware/rateLimiter.js";
import { validateWebhook } from "../middleware/validateWebhook.js";

const router = Router();

/**
 * Webhook endpoint for Telegram updates
 * @route POST /telegram/webhook
 * @param {object} req.body - Update object from Telegram
 * @returns {object} 200 - Success response
 */
router.post("/webhook", webhookLimiter, validateWebhook, (req, res) => {
  // TODO: Implement webhook handler
  // 1. Validate incoming update
  // 2. Process photo messages
  // 3. Extract schedule data using OCR
  // 4. Create calendar events
  res.sendStatus(200);
});

/**
 * Set webhook URL for Telegram Bot
 * @route POST /telegram/setup
 * @returns {object} 200 - Webhook setup confirmation
 */
router.post("/setup", (req, res) => {
  // TODO: Implement webhook setup
  // 1. Get webhook URL from env
  // 2. Register webhook with Telegram
  // 3. Return setup status
  res.sendStatus(200);
});

export default router;
