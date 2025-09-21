/**
 * User session manager for linking Telegram users to Google Calendar accounts
 */

import type {
  UserSession,
  SessionManagerConfig,
  AuthResult,
  OAuthTokens,
  AuthError
} from '../types/auth.js';
import { DEFAULT_SESSION_CONFIG, DEFAULT_CALENDAR_PREFERENCES } from '../types/auth.js';
import { AuthService } from './authService.js';

export class UserSessionManager {
  private sessions = new Map<string, UserSession>();
  private config: SessionManagerConfig;
  private authService: AuthService;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<SessionManagerConfig>) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
    this.authService = new AuthService();
    this.startCleanupInterval();
  }

  /**
   * Create or update user session
   */
  async createSession(telegramUserId: string, tokens?: OAuthTokens): Promise<UserSession> {
    const existingSession = this.sessions.get(telegramUserId);
    
    const session: UserSession = {
      telegramUserId,
      googleTokens: tokens || undefined,
      isAuthenticated: !!tokens,
      createdAt: existingSession?.createdAt || Date.now(),
      lastActivity: Date.now(),
      calendarPreferences: existingSession?.calendarPreferences || { ...DEFAULT_CALENDAR_PREFERENCES }
    };

    this.sessions.set(telegramUserId, session);
    
    console.log(`📝 Session ${tokens ? 'created' : 'updated'} for Telegram user: ${telegramUserId}`);
    return session;
  }

  /**
   * Get user session by Telegram ID
   */
  getSession(telegramUserId: string): UserSession | null {
    const session = this.sessions.get(telegramUserId);
    
    if (!session) {
      return null;
    }

    // Update last activity
    session.lastActivity = Date.now();
    this.sessions.set(telegramUserId, session);
    
    return session;
  }

  /**
   * Check if user is authenticated and has valid tokens
   */
  async isAuthenticated(telegramUserId: string): Promise<boolean> {
    const session = this.getSession(telegramUserId);
    
    if (!session || !session.isAuthenticated || !session.googleTokens) {
      return false;
    }

    // Check if tokens are expired and try to refresh
    if (this.authService.isTokenExpired(session.googleTokens, this.config.tokenRefreshThresholdMs)) {
      console.log(`🔄 Refreshing tokens for user: ${telegramUserId}`);
      
      const refreshResult = await this.authService.refreshTokens(session.googleTokens);
      
      if (refreshResult.success && refreshResult.session?.googleTokens) {
        // Update session with refreshed tokens
        session.googleTokens = refreshResult.session.googleTokens;
        session.lastActivity = Date.now();
        this.sessions.set(telegramUserId, session);
        return true;
      } else {
        // Refresh failed, mark as unauthenticated
        session.isAuthenticated = false;
        delete (session as any).googleTokens;
        this.sessions.set(telegramUserId, session);
        return false;
      }
    }

    return true;
  }

  /**
   * Get valid tokens for authenticated user
   */
  async getValidTokens(telegramUserId: string): Promise<OAuthTokens | null> {
    const isAuth = await this.isAuthenticated(telegramUserId);
    
    if (!isAuth) {
      return null;
    }

    const session = this.getSession(telegramUserId);
    return session?.googleTokens || null;
  }

  /**
   * Update user's calendar preferences
   */
  updateCalendarPreferences(
    telegramUserId: string, 
    preferences: Partial<UserSession['calendarPreferences']>
  ): boolean {
    const session = this.getSession(telegramUserId);
    
    if (!session) {
      return false;
    }

    session.calendarPreferences = {
      ...session.calendarPreferences,
      ...preferences
    };
    
    session.lastActivity = Date.now();
    this.sessions.set(telegramUserId, session);
    
    console.log(`⚙️ Calendar preferences updated for user: ${telegramUserId}`);
    return true;
  }

  /**
   * Revoke user's authentication and clear tokens
   */
  async revokeAuthentication(telegramUserId: string): Promise<boolean> {
    const session = this.getSession(telegramUserId);
    
    if (!session || !session.googleTokens) {
      return false;
    }

    try {
      // Revoke tokens with Google
      const revoked = await this.authService.revokeTokens(session.googleTokens);
      
      if (revoked) {
        // Clear session authentication
        session.isAuthenticated = false;
        delete (session as any).googleTokens;
        session.lastActivity = Date.now();
        this.sessions.set(telegramUserId, session);
        
        console.log(`🔓 Authentication revoked for user: ${telegramUserId}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Failed to revoke authentication:', error);
      return false;
    }
  }

  /**
   * Delete user session completely
   */
  async deleteSession(telegramUserId: string): Promise<boolean> {
    const session = this.getSession(telegramUserId);
    
    if (session && session.googleTokens) {
      // Try to revoke tokens before deletion
      await this.authService.revokeTokens(session.googleTokens);
    }
    
    const existed = this.sessions.delete(telegramUserId);
    
    if (existed) {
      console.log(`🗑️ Session deleted for user: ${telegramUserId}`);
    }
    
    return existed;
  }

  /**
   * Get all active sessions (for admin/monitoring)
   */
  getActiveSessions(): Array<{ telegramUserId: string; isAuthenticated: boolean; lastActivity: number }> {
    const activeSessions: Array<{ telegramUserId: string; isAuthenticated: boolean; lastActivity: number }> = [];
    
    for (const [telegramUserId, session] of this.sessions.entries()) {
      activeSessions.push({
        telegramUserId,
        isAuthenticated: session.isAuthenticated,
        lastActivity: session.lastActivity
      });
    }
    
    return activeSessions.sort((a, b) => b.lastActivity - a.lastActivity);
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    totalSessions: number;
    authenticatedSessions: number;
    expiredSessions: number;
    averageSessionAge: number;
  } {
    const now = Date.now();
    let authenticatedCount = 0;
    let expiredCount = 0;
    let totalAge = 0;

    for (const session of this.sessions.values()) {
      if (session.isAuthenticated) {
        authenticatedCount++;
      }
      
      if (now - session.lastActivity > this.config.sessionTimeoutMs) {
        expiredCount++;
      }
      
      totalAge += now - session.createdAt;
    }

    return {
      totalSessions: this.sessions.size,
      authenticatedSessions: authenticatedCount,
      expiredSessions: expiredCount,
      averageSessionAge: this.sessions.size > 0 ? totalAge / this.sessions.size : 0
    };
  }

  /**
   * Start periodic cleanup of expired sessions
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.config.cleanupIntervalMs);

    console.log('🧹 Session cleanup interval started');
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredUserIds: string[] = [];

    for (const [telegramUserId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.config.sessionTimeoutMs) {
        expiredUserIds.push(telegramUserId);
      }
    }

    if (expiredUserIds.length > 0) {
      console.log(`🧹 Cleaning up ${expiredUserIds.length} expired sessions`);
      
      for (const userId of expiredUserIds) {
        this.sessions.delete(userId);
      }
    }
  }

  /**
   * Force cleanup and stop interval (for shutdown)
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.cleanupExpiredSessions();
    console.log('🛑 User session manager shutdown complete');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SessionManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart cleanup interval with new timing
    this.startCleanupInterval();
    
    console.log('⚙️ Session manager configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): SessionManagerConfig {
    return { ...this.config };
  }

  /**
   * Check if user has reached maximum concurrent sessions
   */
  private hasReachedSessionLimit(telegramUserId: string): boolean {
    // For now, we allow one session per user
    // In the future, this could check for multiple device sessions
    return false;
  }
}