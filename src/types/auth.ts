/**
 * OAuth 2.0 and authentication types for Google Calendar integration
 */

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date?: number; // Unix timestamp in milliseconds
}

export interface OAuthCredentials {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

export interface UserSession {
  telegramUserId: string;
  googleTokens?: OAuthTokens | undefined;
  isAuthenticated: boolean;
  createdAt: number; // Unix timestamp
  lastActivity: number; // Unix timestamp
  calendarPreferences: {
    defaultCalendarId: string;
    timeZone: string;
    reminderMinutes: number;
    autoCreateEvents: boolean;
  };
}

export interface AuthState {
  telegramUserId: string;
  redirectPath?: string | undefined;
  timestamp: number;
  nonce: string; // For security
}

export interface AuthResult {
  success: boolean;
  session?: UserSession;
  error?: AuthError;
  authUrl?: string; // For redirecting user to Google OAuth
}

export interface AuthError {
  code: 
    | 'INVALID_CREDENTIALS'
    | 'TOKEN_EXPIRED'
    | 'REFRESH_FAILED'
    | 'OAUTH_CALLBACK_ERROR'
    | 'INVALID_STATE'
    | 'NETWORK_ERROR'
    | 'QUOTA_EXCEEDED'
    | 'UNAUTHORIZED_SCOPE';
  message: string;
  details?: {
    statusCode?: number;
    originalError?: string;
    retryAfter?: number; // Seconds to wait before retry
  };
}

export interface SessionManagerConfig {
  sessionTimeoutMs: number; // How long sessions last without activity
  cleanupIntervalMs: number; // How often to clean up expired sessions
  maxConcurrentSessions: number; // Max sessions per Telegram user
  tokenRefreshThresholdMs: number; // Refresh tokens when this close to expiry
}

export const DEFAULT_SESSION_CONFIG: SessionManagerConfig = {
  sessionTimeoutMs: 24 * 60 * 60 * 1000, // 24 hours
  cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
  maxConcurrentSessions: 3,
  tokenRefreshThresholdMs: 5 * 60 * 1000 // 5 minutes
} as const;

export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
] as const;

export const DEFAULT_CALENDAR_PREFERENCES = {
  defaultCalendarId: 'primary',
  timeZone: 'America/Los_Angeles', // West Coast timezone
  reminderMinutes: 15,
  autoCreateEvents: true
} as const;