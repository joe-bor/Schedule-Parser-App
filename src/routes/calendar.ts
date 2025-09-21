import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { AuthService } from "../services/authService.js";
import { CalendarService } from "../services/calendarService.js";
import { UserSessionManager } from "../services/userSessionManager.js";
import type { CalendarEventRequest } from "../types/calendar.js";

const router = Router();

// Lazy-load services to avoid environment validation issues in tests
let authService: AuthService | undefined;
let calendarService: CalendarService | undefined;
let sessionManager: UserSessionManager | undefined;

function getAuthService(): AuthService {
  if (!authService) {
    authService = new AuthService();
  }
  return authService;
}

function getCalendarService(): CalendarService {
  if (!calendarService) {
    calendarService = new CalendarService();
  }
  return calendarService;
}

function getSessionManager(): UserSessionManager {
  if (!sessionManager) {
    sessionManager = new UserSessionManager();
  }
  return sessionManager;
}

// Validation schemas
const oauthCallbackSchema = z.object({
  code: z.string(),
  state: z.string(),
  error: z.string().optional()
});

const createEventSchema = z.object({
  summary: z.string().min(1).max(200),
  description: z.string().optional(),
  startDateTime: z.string(),
  endDateTime: z.string(),
  timeZone: z.string().optional(),
  location: z.string().optional(),
  attendeeEmails: z.array(z.string().email()).optional(),
  colorId: z.string().optional()
}).transform(data => ({
  ...data,
  description: data.description || undefined,
  timeZone: data.timeZone || undefined,
  location: data.location || undefined,
  attendeeEmails: data.attendeeEmails || undefined,
  colorId: data.colorId || undefined
}));

const batchCreateEventsSchema = z.object({
  events: z.array(createEventSchema),
  telegramUserId: z.string()
});

/**
 * Generate OAuth authorization URL
 * @route GET /calendar/auth/:telegramUserId
 * @param {string} req.params.telegramUserId - Telegram user ID
 * @returns {object} 200 - Auth URL response
 */
router.get("/auth/:telegramUserId", async (req: Request, res: Response) => {
  try {
    const { telegramUserId } = req.params;
    
    if (!telegramUserId) {
      return res.status(400).json({
        success: false,
        error: "Telegram user ID is required"
      });
    }

    const auth = getAuthService();
    
    if (!auth.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: "Calendar integration not configured. Contact administrator."
      });
    }

    const authUrl = auth.generateAuthUrl(telegramUserId);
    
    res.json({
      success: true,
      authUrl: authUrl,
      message: "Please visit the URL to authorize calendar access"
    });

  } catch (error) {
    console.error("❌ Auth URL generation failed:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate authorization URL"
    });
  }
});

/**
 * OAuth callback handler for Google Calendar
 * @route GET /calendar/oauth/callback
 * @param {string} req.query.code - OAuth authorization code
 * @param {string} req.query.state - State parameter with user info
 * @returns {object} 200 - Auth success response
 */
router.get("/oauth/callback", async (req: Request, res: Response) => {
  try {
    const validation = oauthCallbackSchema.safeParse(req.query);
    
    if (!validation.success) {
      return res.status(400).send(`
        <html><body>
          <h1>❌ Authentication Error</h1>
          <p>Invalid callback parameters</p>
          <p>Please try the authorization process again.</p>
        </body></html>
      `);
    }

    const { code, state, error } = validation.data;

    // Check for OAuth error
    if (error) {
      return res.status(400).send(`
        <html><body>
          <h1>❌ Authentication Cancelled</h1>
          <p>Authorization was cancelled or failed: ${error}</p>
          <p>You can try again through your Telegram bot.</p>
        </body></html>
      `);
    }

    // Handle OAuth callback
    const auth = getAuthService();
    const authResult = await auth.handleCallback(code, state);

    if (!authResult.success || !authResult.session) {
      return res.status(400).send(`
        <html><body>
          <h1>❌ Authentication Failed</h1>
          <p>Error: ${authResult.error?.message || 'Unknown error'}</p>
          <p>Please try the authorization process again.</p>
        </body></html>
      `);
    }

    // Store session
    const sessionMgr = getSessionManager();
    await sessionMgr.createSession(
      authResult.session.telegramUserId,
      authResult.session.googleTokens
    );

    // Success page
    res.send(`
      <html><body>
        <h1>✅ Calendar Integration Successful!</h1>
        <p>Your Google Calendar has been connected successfully.</p>
        <p>You can now return to your Telegram bot to create calendar events from your schedules.</p>
        <script>
          setTimeout(() => {
            window.close();
          }, 3000);
        </script>
      </body></html>
    `);

  } catch (error) {
    console.error("❌ OAuth callback failed:", error);
    res.status(500).send(`
      <html><body>
        <h1>❌ Authentication Error</h1>
        <p>An internal error occurred during authentication</p>
        <p>Please contact support if this problem persists.</p>
      </body></html>
    `);
  }
});

/**
 * Create new calendar event
 * @route POST /calendar/events
 * @param {object} req.body - Event details and telegram user ID
 * @returns {object} 201 - Created event details
 */
router.post("/events", async (req: Request, res: Response) => {
  try {
    const validation = createEventSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid event data",
        details: validation.error.issues
      });
    }

    const telegramUserId = req.headers['x-telegram-user-id'] as string;
    
    if (!telegramUserId) {
      return res.status(401).json({
        success: false,
        error: "Telegram user ID required in headers"
      });
    }

    // Get user tokens
    const sessionMgr = getSessionManager();
    const tokens = await sessionMgr.getValidTokens(telegramUserId);
    
    if (!tokens || !telegramUserId) {
      return res.status(401).json({
        success: false,
        error: "User not authenticated. Please authorize calendar access first."
      });
    }

    // Create calendar event
    const calendar = getCalendarService();
    const result = await calendar.createEvent(validation.data, tokens);

    if (result.success) {
      res.status(201).json({
        success: true,
        event: result.event,
        eventId: result.eventId,
        htmlLink: result.htmlLink
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error("❌ Event creation failed:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create calendar event"
    });
  }
});

/**
 * Create multiple calendar events (batch)
 * @route POST /calendar/events/batch
 * @param {object} req.body - Array of events and telegram user ID
 * @returns {object} 201 - Batch creation results
 */
router.post("/events/batch", async (req: Request, res: Response) => {
  try {
    const validation = batchCreateEventsSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid batch event data",
        details: validation.error.issues
      });
    }

    const { events, telegramUserId } = validation.data;

    // Get user tokens
    const sessionMgr = getSessionManager();
    const tokens = await sessionMgr.getValidTokens(telegramUserId);
    
    if (!tokens || !telegramUserId) {
      return res.status(401).json({
        success: false,
        error: "User not authenticated. Please authorize calendar access first."
      });
    }

    // Create calendar events
    const calendar = getCalendarService();
    const result = await calendar.createMultipleEvents(events, tokens);

    res.status(201).json({
      success: result.success,
      summary: result.summary,
      successfulEvents: result.successfulEvents,
      failedEvents: result.failedEvents,
      totalEvents: result.totalEvents
    });

  } catch (error) {
    console.error("❌ Batch event creation failed:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create calendar events"
    });
  }
});

/**
 * Get user's calendar list
 * @route GET /calendar/calendars/:telegramUserId
 * @param {string} req.params.telegramUserId - Telegram user ID
 * @returns {object} 200 - Calendar list
 */
router.get("/calendars/:telegramUserId", async (req: Request, res: Response) => {
  try {
    const { telegramUserId } = req.params;

    // Get user tokens
    const sessionMgr = getSessionManager();
    const tokens = await sessionMgr.getValidTokens(telegramUserId);
    
    if (!tokens || !telegramUserId) {
      return res.status(401).json({
        success: false,
        error: "User not authenticated. Please authorize calendar access first."
      });
    }

    // Get calendar list
    const calendar = getCalendarService();
    const calendars = await calendar.getCalendarList(tokens);

    res.json({
      success: true,
      calendars: calendars
    });

  } catch (error) {
    console.error("❌ Failed to get calendar list:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve calendar list"
    });
  }
});

/**
 * Check user authentication status
 * @route GET /calendar/status/:telegramUserId
 * @param {string} req.params.telegramUserId - Telegram user ID
 * @returns {object} 200 - Authentication status
 */
router.get("/status/:telegramUserId", async (req: Request, res: Response) => {
  try {
    const { telegramUserId } = req.params;

    const sessionMgr = getSessionManager();
    const isAuthenticated = await sessionMgr.isAuthenticated(telegramUserId);
    const session = sessionMgr.getSession(telegramUserId);

    res.json({
      success: true,
      isAuthenticated: isAuthenticated,
      hasSession: !!session,
      calendarPreferences: session?.calendarPreferences
    });

  } catch (error) {
    console.error("❌ Failed to check auth status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check authentication status"
    });
  }
});

/**
 * Revoke user's calendar access
 * @route DELETE /calendar/auth/:telegramUserId
 * @param {string} req.params.telegramUserId - Telegram user ID
 * @returns {object} 200 - Revocation result
 */
router.delete("/auth/:telegramUserId", async (req: Request, res: Response) => {
  try {
    const { telegramUserId } = req.params;

    const sessionMgr = getSessionManager();
    const revoked = await sessionMgr.revokeAuthentication(telegramUserId);

    res.json({
      success: revoked,
      message: revoked ? "Calendar access revoked successfully" : "No active session found"
    });

  } catch (error) {
    console.error("❌ Failed to revoke authentication:", error);
    res.status(500).json({
      success: false,
      error: "Failed to revoke calendar access"
    });
  }
});

/**
 * Test personal schedule conversion (Joezari Borlongan only)
 * @route POST /calendar/test/personal-schedule
 * @returns {object} 200 - Personal schedule conversion result
 */
router.post("/test/personal-schedule", async (req: Request, res: Response) => {
  try {
    const { ScheduleToCalendarConverter } = await import('../utils/scheduleToCalendar.js');
    
    // Mock parsed schedule data with multiple employees (realistic scenario)
    const mockSchedule = {
      weekInfo: {
        weekStart: "2025-01-27",
        weekEnd: "2025-02-02", 
        dates: ["2025-01-27", "2025-01-28", "2025-01-29", "2025-01-30", "2025-01-31", "2025-02-01", "2025-02-02"]
      },
      departments: {
        "Meat": [
          {
            name: "Joezari Borlongan", // Your schedule
            totalHours: 32,
            department: "Meat",
            weeklySchedule: [
              { date: "2025-01-27", dayName: "Monday", timeSlot: { start: "08:00", end: "16:00", raw: "8:00AM-4:00PM" }},
              { date: "2025-01-28", dayName: "Tuesday", timeSlot: undefined }, // Day off
              { date: "2025-01-29", dayName: "Wednesday", timeSlot: { start: "10:00", end: "18:00", raw: "10:00AM-6:00PM" }},
              { date: "2025-01-30", dayName: "Thursday", timeSlot: { start: "08:00", end: "16:00", raw: "8:00AM-4:00PM" }},
              { date: "2025-01-31", dayName: "Friday", timeSlot: { start: "09:00", end: "17:00", raw: "9:00AM-5:00PM" }},
              { date: "2025-02-01", dayName: "Saturday", timeSlot: undefined }, // Day off
              { date: "2025-02-02", dayName: "Sunday", timeSlot: undefined } // Day off
            ]
          },
          {
            name: "John Doe", // Other employee - should be filtered out
            totalHours: 40,
            department: "Meat",
            weeklySchedule: [
              { date: "2025-01-27", dayName: "Monday", timeSlot: { start: "09:00", end: "17:00", raw: "9:00AM-5:00PM" }},
              { date: "2025-01-28", dayName: "Tuesday", timeSlot: { start: "10:00", end: "18:00", raw: "10:00AM-6:00PM" }},
              { date: "2025-01-29", dayName: "Wednesday", timeSlot: { start: "08:00", end: "16:00", raw: "8:00AM-4:00PM" }},
              { date: "2025-01-30", dayName: "Thursday", timeSlot: { start: "09:00", end: "17:00", raw: "9:00AM-5:00PM" }},
              { date: "2025-01-31", dayName: "Friday", timeSlot: { start: "10:00", end: "18:00", raw: "10:00AM-6:00PM" }},
              { date: "2025-02-01", dayName: "Saturday", timeSlot: undefined },
              { date: "2025-02-02", dayName: "Sunday", timeSlot: undefined }
            ]
          }
        ],
        "Produce": [
          {
            name: "Jane Smith", // Another employee - should be filtered out
            totalHours: 35,
            department: "Produce",
            weeklySchedule: [
              { date: "2025-01-27", dayName: "Monday", timeSlot: { start: "07:00", end: "15:00", raw: "7:00AM-3:00PM" }},
              { date: "2025-01-28", dayName: "Tuesday", timeSlot: { start: "08:00", end: "16:00", raw: "8:00AM-4:00PM" }},
              { date: "2025-01-29", dayName: "Wednesday", timeSlot: { start: "09:00", end: "17:00", raw: "9:00AM-5:00PM" }},
              { date: "2025-01-30", dayName: "Thursday", timeSlot: undefined },
              { date: "2025-01-31", dayName: "Friday", timeSlot: { start: "07:00", end: "15:00", raw: "7:00AM-3:00PM" }},
              { date: "2025-02-01", dayName: "Saturday", timeSlot: undefined },
              { date: "2025-02-02", dayName: "Sunday", timeSlot: undefined }
            ]
          }
        ]
      },
      totalEmployees: 3,
      parseMetadata: {
        confidence: 0.94,
        processingTime: 1800,
        ocrEngine: 'hybrid' as const,
        warnings: [],
        errors: []
      }
    };

    // Use PERSONAL converter - only creates events for Joezari Borlongan
    const personalConverter = ScheduleToCalendarConverter.createPersonalConverter();
    const result = personalConverter.convertSchedule(mockSchedule);

    // Also show what ALL employees converter would create (for comparison)
    const allConverter = new ScheduleToCalendarConverter();
    const allResult = allConverter.convertSchedule(mockSchedule);

    res.json({
      success: true,
      personalSchedule: {
        events: result.events,
        summary: result.summary,
        eventsCount: result.events.length
      },
      allEmployeesComparison: {
        eventsCount: allResult.events.length,
        summary: allResult.summary
      },
      filtering: {
        totalEmployeesInSchedule: mockSchedule.totalEmployees,
        personalEventsCreated: result.events.length,
        allEmployeesWouldCreate: allResult.events.length,
        filteredOut: allResult.events.length - result.events.length
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Personal schedule conversion failed'
    });
  }
});

export default router;
