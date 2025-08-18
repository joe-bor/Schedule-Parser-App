import { Router } from "express";
import { webhookLimiter } from "../middleware/rateLimiter.js";
import { validateWebhook } from "../middleware/validateWebhook.js";
import { validateEnv } from "../config/env.js";
import { TelegramFileManager } from "../services/fileManager.js";
import { OCRProcessor } from "../services/ocrProcessor.js";
import type { ProcessingError } from "../types/ocr.js";

const router = Router();

// Lazy-load OCR services to avoid environment validation issues in tests
let fileManager: TelegramFileManager | undefined;
let ocrProcessor: OCRProcessor | undefined;

function getFileManager(): TelegramFileManager {
  if (!fileManager) {
    fileManager = new TelegramFileManager();
  }
  return fileManager;
}

function getOcrProcessor(): OCRProcessor {
  if (!ocrProcessor) {
    ocrProcessor = new OCRProcessor();
  }
  return ocrProcessor;
}

/**
 * Process document for OCR and return extracted text
 */
async function processDocumentOCR(document: any, chatId: number): Promise<void> {
  try {
    // Check if it's an image document
    if (!document.mime_type?.startsWith('image/')) {
      await sendMessage(chatId, "❌ Please send an image file (JPEG, PNG, WebP) for OCR processing.");
      return;
    }

    await sendMessage(chatId, "📄 I received your document! Starting OCR processing...");
    
    console.log(`🔍 Processing document: ${document.file_id} (${document.file_name}) - ${document.file_size} bytes`);
    
    // Download the document
    const downloadResult = await getFileManager().downloadPhoto(document.file_id);
    console.log(`✅ Document downloaded: ${downloadResult.buffer.length} bytes`);
    
    // Extract text using OCR
    const ocrResult = await getOcrProcessor().extractText(downloadResult.buffer);
    
    // Send results to user
    if (ocrResult.text.trim().length > 0) {
      const message = `✅ <b>OCR Processing Complete!</b> 📄\n\n` +
                     `📝 <b>Extracted Text:</b>\n<code>${ocrResult.text}</code>\n\n` +
                     `🎯 <b>Confidence:</b> ${(ocrResult.confidence * 100).toFixed(1)}%\n` +
                     `⏱️ <b>Processing Time:</b> ${ocrResult.processingTime}ms\n\n` +
                     `🔄 <i>Schedule parsing and calendar integration coming soon!</i>`;
      
      await sendMessage(chatId, message);
    } else {
      await sendMessage(chatId, "❌ No text could be extracted from the document. Please try with a clearer image file.");
    }
    
  } catch (error) {
    console.error("❌ OCR processing failed:", error);
    
    let errorMessage = "❌ Failed to process your document. ";
    
    if (error && typeof error === 'object' && 'code' in error) {
      const processingError = error as ProcessingError;
      switch (processingError.code) {
        case 'FILE_TOO_LARGE':
          errorMessage += "The document is too large. Please send a smaller file (max 10MB).";
          break;
        case 'INVALID_FILE':
          errorMessage += "Invalid image format. Please send a JPEG, PNG, or WebP file.";
          break;
        case 'OCR_FAILED':
          errorMessage += "Text extraction failed. Please try with a clearer, higher-contrast image file.";
          break;
        case 'NETWORK_ERROR':
          errorMessage += "Network error occurred. Please try again.";
          break;
        default:
          errorMessage += "Please try again or contact support if the problem persists.";
      }
    } else {
      errorMessage += "Please try again or contact support if the problem persists.";
    }
    
    await sendMessage(chatId, errorMessage);
  }
}

/**
 * Process photo for OCR and return extracted text
 */
async function processPhotoOCR(photoSizes: any[], chatId: number): Promise<void> {
  try {
    await sendMessage(chatId, "📸 I received your photo! Starting OCR processing...");
    
    // Get the largest photo size for better OCR results
    const largestPhoto = photoSizes.reduce((largest, current) => 
      current.file_size > largest.file_size ? current : largest
    );
    
    console.log(`🔍 Processing photo: ${largestPhoto.file_id} (${largestPhoto.width}x${largestPhoto.height})`);
    
    // Download the photo
    const downloadResult = await getFileManager().downloadPhoto(largestPhoto.file_id);
    console.log(`✅ Photo downloaded: ${downloadResult.buffer.length} bytes`);
    
    // Extract text using OCR
    const ocrResult = await getOcrProcessor().extractText(downloadResult.buffer);
    
    // Send results to user
    if (ocrResult.text.trim().length > 0) {
      const message = `✅ <b>OCR Processing Complete!</b>\n\n` +
                     `📝 <b>Extracted Text:</b>\n<code>${ocrResult.text}</code>\n\n` +
                     `🎯 <b>Confidence:</b> ${(ocrResult.confidence * 100).toFixed(1)}%\n` +
                     `⏱️ <b>Processing Time:</b> ${ocrResult.processingTime}ms\n\n` +
                     `🔄 <i>Schedule parsing and calendar integration coming soon!</i>`;
      
      await sendMessage(chatId, message);
    } else {
      await sendMessage(chatId, "❌ No text could be extracted from the image. Please try with a clearer photo.");
    }
    
  } catch (error) {
    console.error("❌ OCR processing failed:", error);
    
    let errorMessage = "❌ Failed to process your photo. ";
    
    if (error && typeof error === 'object' && 'code' in error) {
      const processingError = error as ProcessingError;
      switch (processingError.code) {
        case 'FILE_TOO_LARGE':
          errorMessage += "The image is too large. Please send a smaller image (max 10MB).";
          break;
        case 'INVALID_FILE':
          errorMessage += "Invalid image format. Please send a JPEG, PNG, or WebP image.";
          break;
        case 'OCR_FAILED':
          errorMessage += "Text extraction failed. Please try with a clearer, higher-contrast image.";
          break;
        case 'NETWORK_ERROR':
          errorMessage += "Network error occurred. Please try again.";
          break;
        default:
          errorMessage += "Please try again or contact support if the problem persists.";
      }
    } else {
      errorMessage += "Please try again or contact support if the problem persists.";
    }
    
    await sendMessage(chatId, errorMessage);
  }
}

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
    
    const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    console.log(`🔍 Sending message to URL: ${url}`);
    console.log(`🔍 Chat ID: ${chatId}, Text: "${text}"`);
    
    const response = await fetch(url,
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
    
    console.log(`🔍 Response status: ${response.status} ${response.statusText}`);
    const result = await response.json();
    console.log(`🔍 Response body:`, result);
    
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
    // Process photo with OCR (run asynchronously to avoid blocking webhook response)
    processPhotoOCR(update.message.photo, update.message.chat.id).catch(error => {
      console.error("❌ Async photo OCR processing failed:", error);
    });
  }

  if (update.message?.document) {
    // Process document with OCR (run asynchronously to avoid blocking webhook response)
    processDocumentOCR(update.message.document, update.message.chat.id).catch(error => {
      console.error("❌ Async document OCR processing failed:", error);
    });
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

// Graceful shutdown handler for OCR worker
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, cleaning up OCR processor...');
  if (ocrProcessor) {
    await OCRProcessor.cleanup(ocrProcessor);
  }
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, cleaning up OCR processor...');
  if (ocrProcessor) {
    await OCRProcessor.cleanup(ocrProcessor);
  }
});

export default router;
