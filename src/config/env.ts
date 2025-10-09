import { z } from "zod";

export const envSchema = z.object({
  // Server
  PORT: z.string().default("3000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Telegram (required for bot functionality)
  TELEGRAM_BOT_TOKEN: z.string(),
  TELEGRAM_WEBHOOK_URL: z.string().optional(), // Format: https://domain.com/api/telegram/webhook (used to derive base URL for calendar routes)

  // Google Calendar OAuth (optional for development, required for calendar integration)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  
  // Calendar integration settings
  CALENDAR_DEFAULT_TIMEZONE: z.string().default("America/New_York"),
  CALENDAR_SESSION_TIMEOUT_HOURS: z
    .string()
    .default("24")
    .transform((val) => parseInt(val, 10)),
  CALENDAR_BATCH_SIZE: z
    .string()
    .default("10")
    .transform((val) => parseInt(val, 10)),
  CALENDAR_CONFLICT_DETECTION: z
    .string()
    .default("true")
    .transform((val) => val === "true"),

  // Google Cloud Vision (required for OCR)
  GOOGLE_CLOUD_PROJECT_ID: z.string().min(1, "Google Cloud Project ID is required for OCR"),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1, "Google Application Credentials path is required for OCR"),
  GOOGLE_VISION_QUOTA_LIMIT: z
    .string()
    .default("1000")
    .transform((val) => parseInt(val, 10)),
  GOOGLE_VISION_USE_DOCUMENT_DETECTION: z
    .string()
    .default("true")
    .transform((val) => val === "true"),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error("❌ Invalid environment variables:", error);
    // Don't exit in test environment
    if (process.env.NODE_ENV === 'test') {
      throw error;
    }
    process.exit(1);
  }
}
