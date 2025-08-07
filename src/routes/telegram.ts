import { Router } from "express";
import { webhookLimiter } from "../middleware/rateLimiter.js";
import { validateWebhook } from "../middleware/validateWebhook.js";
import { validateEnv } from "../config/env.js";

const router = Router();

/**
 * Send a message to a Telegram chat
 */
async function sendMessage(chatId: number, text: string): Promise<void> {
  try {
    const env = validateEnv();
    
    if (!env.TELEGRAM_BOT_TOKEN) {
      console.error("❌ Cannot send message: TELEGRAM_BOT_TOKEN not configured");
      return;
    }
    
    const response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML'
        })
      }
    );
    
    const result = await response.json();
    
    if (result.ok) {
      console.log(`✅ Message sent to chat ${chatId}`);
    } else {
      console.error(`❌ Failed to send message to chat ${chatId}:`, result);
    }
  } catch (error) {
    console.error(`❌ Error sending message to chat ${chatId}:`, error);
  }
}

/**
 * Webhook endpoint for Telegram updates
 * @route POST /telegram/webhook
 * @param {object} req.body - Update object from Telegram
 * @returns {object} 200 - Success response
 */
router.post("/webhook", webhookLimiter, validateWebhook, async (req, res) => {
  const update = req.body;
  
  console.log("📨 Received Telegram webhook:");
  console.log("Update ID:", update.update_id);
  
  // Handle different types of updates
  if (update.message) {
    const message = update.message;
    console.log("Message details:", {
      messageId: message.message_id,
      chatId: message.chat.id,
      userId: message.from?.id,
      username: message.from?.username,
      firstName: message.from?.first_name,
      date: message.date
    });
    
    if (message.text) {
      console.log("📝 Text:", message.text);
    }
    
    if (message.photo) {
      console.log("📸 Photo received:", message.photo.length, "sizes");
      console.log("Caption:", message.caption || "No caption");
    }
    
    if (message.document) {
      console.log("📎 Document:", message.document.file_name);
    }
  }
  
  if (update.edited_message) {
    console.log("✏️ Message edited");
  }
  
  if (update.callback_query) {
    console.log("🔘 Callback query:", update.callback_query.data);
  }
  
  // Send response to user if it's a text message
  if (update.message?.text) {
    await sendMessage(update.message.chat.id, `You said: "${update.message.text}"`);
  }
  
  if (update.message?.photo) {
    await sendMessage(update.message.chat.id, "📸 I received your photo! OCR processing will be implemented soon.");
  }
  
  // Always respond with 200 to acknowledge receipt
  res.status(200).json({ 
    ok: true, 
    message: "Webhook received successfully" 
  });
});

/**
 * Set webhook URL for Telegram Bot
 * @route POST /telegram/setup
 * @returns {object} 200 - Webhook setup confirmation
 */
router.post("/setup", async (_req, res) => {
  try {
    const env = validateEnv();
    
    if (!env.TELEGRAM_BOT_TOKEN) {
      return res.status(400).json({ 
        error: "TELEGRAM_BOT_TOKEN not configured" 
      });
    }
    
    if (!env.TELEGRAM_WEBHOOK_URL) {
      return res.status(400).json({ 
        error: "TELEGRAM_WEBHOOK_URL not configured" 
      });
    }
    
    // Warn about localhost URLs
    if (env.TELEGRAM_WEBHOOK_URL.includes('localhost')) {
      console.log("⚠️ WARNING: Using localhost URL for webhook. Use ngrok or similar for testing.");
    }
    
    const webhookUrl = env.TELEGRAM_WEBHOOK_URL.startsWith('http') 
      ? env.TELEGRAM_WEBHOOK_URL 
      : `https://${env.TELEGRAM_WEBHOOK_URL}`;
    
    const response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message', 'edited_message', 'callback_query']
        })
      }
    );
    
    const result = await response.json();
    
    if (result.ok) {
      console.log("✅ Webhook set successfully:", webhookUrl);
      res.status(200).json({ 
        success: true, 
        webhook_url: webhookUrl,
        result: result 
      });
    } else {
      console.error("❌ Failed to set webhook:", result);
      res.status(400).json({ 
        error: "Failed to set webhook", 
        details: result 
      });
    }
  } catch (error) {
    console.error("❌ Webhook setup error:", error);
    res.status(500).json({ 
      error: "Internal server error during webhook setup" 
    });
  }
});

export default router;
