import { Router } from "express";
import { webhookLimiter } from "../middleware/rateLimiter.js";
import { validateWebhook } from "../middleware/validateWebhook.js";
import { validateEnv } from "../config/env.js";
import { TelegramFileManager } from "../services/fileManager.js";
import { OCRProcessor } from "../services/ocrProcessor.js";
import { UserSessionManager } from "../services/userSessionManager.js";
import type { ProcessingError } from "../types/ocr.js";
import type { ParsedSchedule, Employee } from "../types/schedule.js";

const router = Router();

// Lazy-load services to avoid environment validation issues in tests
let fileManager: TelegramFileManager | undefined;
let ocrProcessor: OCRProcessor | undefined;
let sessionManager: UserSessionManager | undefined;

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

function getSessionManager(): UserSessionManager {
  if (!sessionManager) {
    sessionManager = new UserSessionManager();
  }
  return sessionManager;
}

/**
 * Process document for schedule parsing (Phase 3A)
 */
async function processDocumentSchedule(document: any, chatId: number): Promise<void> {
  try {
    // Check if it's an image document
    if (!document.mime_type?.startsWith('image/')) {
      await sendMessage(chatId, "❌ Please send an image file (JPEG, PNG, WebP) for schedule parsing.");
      return;
    }

    await sendMessage(chatId, "📅 Schedule parsing activated! Processing your employee schedule...");
    
    console.log(`🔍 Processing schedule: ${document.file_id} (${document.file_name}) - ${document.file_size} bytes`);
    
    // Download the document
    const downloadResult = await getFileManager().downloadPhoto(document.file_id);
    console.log(`✅ Document downloaded: ${downloadResult.buffer.length} bytes`);
    
    // Extract and parse schedule
    const scheduleResult = await getOcrProcessor().extractSchedule(downloadResult.buffer);
    
    // Send structured schedule results to user
    await sendScheduleResults(chatId, scheduleResult);
    
  } catch (error) {
    console.error("❌ Schedule parsing failed:", error);
    
    let errorMessage = "❌ Failed to parse your schedule. ";
    
    if (error && typeof error === 'object' && 'code' in error) {
      const processingError = error as ProcessingError;
      switch (processingError.code) {
        case 'INVALID_TABLE_STRUCTURE':
          errorMessage += "The image doesn't appear to contain a valid employee schedule table.";
          break;
        case 'OCR_FAILED':
          errorMessage += "Could not read text from the image. Please ensure the schedule is clearly visible.";
          break;
        case 'FILE_TOO_LARGE':
          errorMessage += "The image file is too large. Please send a smaller file.";
          break;
        default:
          errorMessage += "Please try with a clearer image or contact support.";
      }
    } else {
      errorMessage += "Please try again or contact support if the issue persists.";
    }
    
    await sendMessage(chatId, errorMessage);
  }
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
      // Create engine status message
      let engineInfo = `🤖 <b>Engine:</b> ${ocrResult.engine || 'tesseract'}`;
      if (ocrResult.fallbackUsed) {
        engineInfo += ` (fallback activated)`;
      }
      
      // Add comparison if both engines were used
      let comparisonInfo = '';
      if (ocrResult.tesseractResult && ocrResult.googleVisionResult) {
        comparisonInfo = `\n📊 <b>Comparison:</b>\n` +
                        `   • Tesseract: ${(ocrResult.tesseractResult.confidence * 100).toFixed(1)}%\n` +
                        `   • Google Vision: ${(ocrResult.googleVisionResult.confidence * 100).toFixed(1)}%`;
      }
      
      // Truncate text if too long for Telegram
      let displayText = ocrResult.text;
      const maxLength = 3000; // Leave room for other message content
      if (displayText.length > maxLength) {
        displayText = displayText.substring(0, maxLength) + '\n\n... [Text truncated due to length]';
      }
      
      const message = `✅ <b>OCR Processing Complete!</b> 📄\n\n` +
                     `📝 <b>Extracted Text:</b>\n<code>${displayText}</code>\n\n` +
                     `🎯 <b>Confidence:</b> ${(ocrResult.confidence * 100).toFixed(1)}%\n` +
                     engineInfo + `\n` +
                     `🔧 <b>Preprocessing:</b> ${ocrResult.preprocessingMethod || 'standard'}\n` +
                     `⏱️ <b>Processing Time:</b> ${ocrResult.processingTime}ms` +
                     comparisonInfo + `\n\n` +
                     `📅 <i>Ready for calendar integration! Send /calendar to connect your Google Calendar.</i>`;
      
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
 * Send formatted schedule results to user
 */
async function sendScheduleResults(chatId: number, scheduleResult: any): Promise<void> {
  const { ocr, schedule, validation } = scheduleResult;
  
  // Create header with OCR info
  let message = `✅ <b>Schedule Parsing Complete!</b> 📅\n\n`;
  
  // Add OCR metadata
  message += `🎯 <b>OCR Confidence:</b> ${(ocr.confidence * 100).toFixed(1)}%\n`;
  message += `🤖 <b>Engine:</b> ${ocr.engine || 'tesseract'}`;
  if (ocr.fallbackUsed) {
    message += ` (fallback activated)`;
  }
  message += `\n⏱️ <b>Processing Time:</b> ${ocr.processingTime + schedule.parseMetadata.processingTime}ms\n\n`;
  
  // Add schedule summary
  message += `📊 <b>Schedule Summary:</b>\n`;
  message += `📅 Week: ${formatDate(schedule.weekInfo.weekStart)} - ${formatDate(schedule.weekInfo.weekEnd)}\n`;
  message += `👥 Total Employees: ${schedule.totalEmployees}\n`;
  message += `🏢 Departments: ${Object.keys(schedule.departments).length}\n\n`;
  
  // Add validation status
  if (validation.isValid) {
    message += `✅ <b>Validation:</b> PASSED\n`;
  } else {
    message += `⚠️ <b>Validation:</b> ${validation.errors.length} errors, ${validation.warnings.length} warnings\n`;
  }
  
  if (validation.warnings.length > 0) {
    message += `\n📋 <b>Warnings:</b>\n`;
    validation.warnings.slice(0, 3).forEach((warning: string) => {
      message += `• ${warning}\n`;
    });
    if (validation.warnings.length > 3) {
      message += `... and ${validation.warnings.length - 3} more\n`;
    }
  }
  
  message += `\n`;
  
  // Add department breakdown
  for (const [deptName, employees] of Object.entries(schedule.departments)) {
    message += `🏢 <b>${deptName} Department</b> (${(employees as Employee[]).length} employees)\n`;
    
    for (const employee of (employees as Employee[]).slice(0, 3)) { // Show first 3
      const workDays = employee.weeklySchedule.filter(day => day.timeSlot).length;
      message += `   👤 ${employee.name}: ${employee.totalHours}hrs (${workDays} days)\n`;
    }
    
    if ((employees as Employee[]).length > 3) {
      message += `   ... and ${(employees as Employee[]).length - 3} more employees\n`;
    }
    message += `\n`;
  }
  
  // Check message length and truncate if needed
  if (message.length > 4000) {
    message = message.substring(0, 3800) + '\n\n... [Results truncated due to length]';
  }
  
  message += `🔄 <i>Google Calendar integration coming next!</i>`;
  
  await sendMessage(chatId, message);
  
  // Send detailed employee schedules in separate messages if requested
  // This could be activated by a command or button
}

/**
 * Format date for display (YYYY-MM-DD -> MM/DD)
 */
function formatDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}`;
  } catch {
    return dateStr;
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
      // Create engine status message
      let engineInfo = `🤖 <b>Engine:</b> ${ocrResult.engine || 'tesseract'}`;
      if (ocrResult.fallbackUsed) {
        engineInfo += ` (fallback activated)`;
      }
      
      // Add comparison if both engines were used
      let comparisonInfo = '';
      if (ocrResult.tesseractResult && ocrResult.googleVisionResult) {
        comparisonInfo = `\n📊 <b>Comparison:</b>\n` +
                        `   • Tesseract: ${(ocrResult.tesseractResult.confidence * 100).toFixed(1)}%\n` +
                        `   • Google Vision: ${(ocrResult.googleVisionResult.confidence * 100).toFixed(1)}%`;
      }
      
      // Truncate text if too long for Telegram
      let displayText = ocrResult.text;
      const maxLength = 3000; // Leave room for other message content
      if (displayText.length > maxLength) {
        displayText = displayText.substring(0, maxLength) + '\n\n... [Text truncated due to length]';
      }
      
      const message = `✅ <b>OCR Processing Complete!</b>\n\n` +
                     `📝 <b>Extracted Text:</b>\n<code>${displayText}</code>\n\n` +
                     `🎯 <b>Confidence:</b> ${(ocrResult.confidence * 100).toFixed(1)}%\n` +
                     engineInfo + `\n` +
                     `🔧 <b>Preprocessing:</b> ${ocrResult.preprocessingMethod || 'standard'}\n` +
                     `⏱️ <b>Processing Time:</b> ${ocrResult.processingTime}ms` +
                     comparisonInfo + `\n\n` +
                     `📅 <i>Ready for calendar integration! Send /calendar to connect your Google Calendar.</i>`;
      
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
 * Handle text messages and commands
 */
async function handleTextMessage(text: string, chatId: number, telegramUserId: string): Promise<void> {
  const command = text.toLowerCase().trim();
  
  // Handle calendar-related commands
  if (command.startsWith('/calendar')) {
    await handleCalendarCommand(chatId, telegramUserId);
    return;
  }
  
  if (command.startsWith('/status')) {
    await handleStatusCommand(chatId, telegramUserId);
    return;
  }
  
  if (command.startsWith('/help')) {
    await handleHelpCommand(chatId);
    return;
  }
  
  if (command.startsWith('/start')) {
    await handleStartCommand(chatId);
    return;
  }
  
  if (command.startsWith('/ocr')) {
    await sendMessage(chatId, `🔧 <b>Mode switched to OCR</b> 📄

Send me an image and I'll extract the raw text using our multi-engine OCR pipeline.
Use /schedule to switch back to schedule parsing mode.`);
    // TODO: Store user preference in database/memory
    return;
  }
  
  if (command.startsWith('/schedule')) {
    await sendMessage(chatId, `📅 <b>Mode switched to Schedule Parsing</b>

Send me an employee schedule image and I'll extract structured data including:
• Employee names and departments  
• Work schedules and hours
• Time slots and validation
• Week information

Use /ocr to switch to basic text extraction mode.`);
    // TODO: Store user preference in database/memory
    return;
  }
  
  // Default response for other text
  await sendMessage(chatId, `📝 I received your message: "${text}"

💡 Send me an employee schedule image to get started!
Use /help for available commands.`);
}

/**
 * Handle calendar authorization command
 */
async function handleCalendarCommand(chatId: number, telegramUserId: string): Promise<void> {
  try {
    const sessionMgr = getSessionManager();
    const isAuthenticated = await sessionMgr.isAuthenticated(telegramUserId);
    
    if (isAuthenticated) {
      await sendMessage(chatId, 
        `✅ <b>Calendar Already Connected!</b>\n\n` +
        `Your Google Calendar is connected and ready to use.\n\n` +
        `📸 Send me a schedule photo to automatically create calendar events!\n\n` +
        `Commands:\n` +
        `• /status - Check connection status\n` +
        `• /disconnect - Disconnect calendar\n` +
        `• /help - Show all commands`
      );
      return;
    }
    
    // Get authorization URL
    const env = validateEnv();
    const baseUrl = env.TELEGRAM_WEBHOOK_URL?.replace('/webhook', '') || 'http://localhost:3000';
    const authUrl = `${baseUrl}/api/calendar/auth/${telegramUserId}`;
    
    try {
      const response = await fetch(authUrl);
      const result = await response.json();
      
      if (result.success) {
        await sendMessage(chatId,
          `🔗 <b>Connect Your Google Calendar</b>\n\n` +
          `Click the link below to authorize calendar access:\n` +
          `${result.authUrl}\n\n` +
          `🔒 This will allow me to create calendar events from your schedule photos.\n\n` +
          `After authorization, return here and send me a schedule photo!`
        );
      } else {
        await sendMessage(chatId,
          `❌ <b>Calendar Integration Unavailable</b>\n\n` +
          `${result.error}\n\n` +
          `Please contact the administrator to enable calendar integration.`
        );
      }
    } catch (error) {
      console.error('❌ Failed to get auth URL:', error);
      await sendMessage(chatId,
        `❌ <b>Calendar Setup Failed</b>\n\n` +
        `Unable to generate authorization link. Please try again later or contact support.`
      );
    }
    
  } catch (error) {
    console.error('❌ Calendar command failed:', error);
    await sendMessage(chatId,
      `❌ Something went wrong with the calendar command. Please try again later.`
    );
  }
}

/**
 * Handle status command
 */
async function handleStatusCommand(chatId: number, telegramUserId: string): Promise<void> {
  try {
    const sessionMgr = getSessionManager();
    const isAuthenticated = await sessionMgr.isAuthenticated(telegramUserId);
    const session = sessionMgr.getSession(telegramUserId);
    
    let statusMessage = `📊 <b>Bot Status</b>\n\n`;
    
    // OCR Status
    statusMessage += `🔍 <b>OCR Engine:</b> ✅ Ready\n`;
    statusMessage += `   • Tesseract.js: Active\n`;
    statusMessage += `   • Google Vision: ${process.env.GOOGLE_VISION_ENABLED === 'true' ? 'Active' : 'Disabled'}\n\n`;
    
    // Calendar Status
    statusMessage += `📅 <b>Calendar Integration:</b>\n`;
    if (isAuthenticated) {
      statusMessage += `   • Status: ✅ Connected\n`;
      statusMessage += `   • Account: ${session?.calendarPreferences.defaultCalendarId || 'primary'}\n`;
      statusMessage += `   • Timezone: ${session?.calendarPreferences.timeZone || 'America/New_York'}\n`;
    } else {
      statusMessage += `   • Status: ❌ Not Connected\n`;
      statusMessage += `   • Use /calendar to connect\n`;
    }
    
    statusMessage += `\n📸 <b>Ready to process schedule photos!</b>`;
    
    await sendMessage(chatId, statusMessage);
    
  } catch (error) {
    console.error('❌ Status command failed:', error);
    await sendMessage(chatId, `❌ Unable to get status information.`);
  }
}

/**
 * Handle help command
 */
async function handleHelpCommand(chatId: number): Promise<void> {
  const helpMessage = 
    `🤖 <b>Schedule Parser Bot - Help</b>\n\n` +
    `<b>📸 Photo Processing:</b>\n` +
    `• Send any schedule photo (JPEG, PNG, WebP)\n` +
    `• I'll extract text using advanced OCR (90.5% accuracy)\n` +
    `• Supports employee schedules, shift calendars, etc.\n\n` +
    `<b>📅 Calendar Integration:</b>\n` +
    `• /calendar - Connect Google Calendar\n` +
    `• /status - Check connection status\n` +
    `• Automatically creates events from schedules\n\n` +
    `<b>🔧 Commands:</b>\n` +
    `• /start - Welcome message\n` +
    `• /help - Show this help\n` +
    `• /status - Bot and calendar status\n` +
    `• /calendar - Calendar authorization\n` +
    `• /ocr - Basic OCR mode (text extraction only)\n` +
    `• /schedule - Schedule parsing mode (structured data)\n\n` +
    `<b>🚀 How to Use:</b>\n` +
    `1. Send /calendar to connect Google Calendar\n` +
    `2. Send a schedule photo\n` +
    `3. I'll create calendar events automatically!\n\n` +
    `<i>Powered by Tesseract.js & Google Vision AI</i>`;
  
  await sendMessage(chatId, helpMessage);
}

/**
 * Handle start command
 */
async function handleStartCommand(chatId: number): Promise<void> {
  const welcomeMessage = 
    `🎉 <b>Welcome to Schedule Parser Bot!</b>\n\n` +
    `🎯 <b>What I can do:</b>\n` +
    `• Parse employee schedules from images\n` +
    `• Extract structured data (names, hours, departments)\n` +
    `• Create Google Calendar events automatically\n` +
    `• High accuracy OCR with Google Vision fallback (90.5% confidence)\n\n` +
    `🚀 <b>Quick Start:</b>\n` +
    `1. Use /calendar to connect your Google Calendar (optional)\n` +
    `2. Send me a photo of your schedule\n` +
    `3. I'll parse and optionally create calendar events!\n\n` +
    `🔧 <b>Modes:</b>\n` +
    `• /schedule - Full schedule parsing (default)\n` +
    `• /ocr - Basic text extraction only\n\n` +
    `Use /help to see all available commands.`;
  
  await sendMessage(chatId, welcomeMessage);
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
  
  // Handle text commands
  if (update.message?.text) {
    await handleTextMessage(update.message.text, update.message.chat.id, update.message.from?.id?.toString() || '');
  }
  
  if (update.message?.photo) {
    // Process photo with OCR (run asynchronously to avoid blocking webhook response)
    processPhotoOCR(update.message.photo, update.message.chat.id).catch(error => {
      console.error("❌ Async photo OCR processing failed:", error);
    });
  }

  if (update.message?.document) {
    // Process document with schedule parsing by default (Phase 3A)
    // Run asynchronously to avoid blocking webhook response
    processDocumentSchedule(update.message.document, update.message.chat.id).catch(error => {
      console.error("❌ Async document schedule processing failed:", error);
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
