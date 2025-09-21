/**
 * OAuth 2.0 service for Google Calendar authentication
 */

import { google } from 'googleapis';
import crypto from 'crypto';
import { validateEnv } from '../config/env.js';
import type { 
  OAuthTokens, 
  OAuthCredentials, 
  AuthState, 
  AuthResult, 
  AuthError,
  UserSession
} from '../types/auth.js';
import { GOOGLE_OAUTH_SCOPES, DEFAULT_CALENDAR_PREFERENCES } from '../types/auth.js';

export class AuthService {
  private oauth2Client: any;
  private pendingStates = new Map<string, AuthState>();
  private credentials: OAuthCredentials = {
    client_id: '',
    client_secret: '',
    redirect_uri: ''
  };

  constructor() {
    this.initializeOAuth();
  }

  private initializeOAuth(): void {
    const env = validateEnv();
    
    this.credentials = {
      client_id: env.GOOGLE_CLIENT_ID || '',
      client_secret: env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: env.GOOGLE_REDIRECT_URI || ''
    };

    // Validate required credentials
    if (!this.credentials.client_id || !this.credentials.client_secret || !this.credentials.redirect_uri) {
      console.warn('⚠️ Google Calendar OAuth credentials not configured. Calendar integration will be disabled.');
      return;
    }

    this.oauth2Client = new google.auth.OAuth2(
      this.credentials.client_id,
      this.credentials.client_secret,
      this.credentials.redirect_uri
    );

    console.log('✅ OAuth service initialized successfully');
  }

  /**
   * Generate authorization URL for user to authenticate with Google
   */
  generateAuthUrl(telegramUserId: string, redirectPath?: string): string {
    if (!this.oauth2Client) {
      throw new Error('OAuth not configured. Check environment variables.');
    }

    // Generate secure state parameter
    const nonce = crypto.randomBytes(16).toString('hex');
    const state: AuthState = {
      telegramUserId,
      redirectPath: redirectPath || undefined,
      timestamp: Date.now(),
      nonce
    };

    // Store state for verification in callback
    const stateToken = Buffer.from(JSON.stringify(state)).toString('base64url');
    this.pendingStates.set(stateToken, state);

    // Clean up old states (older than 10 minutes)
    this.cleanupExpiredStates();

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline', // Request refresh token
      scope: GOOGLE_OAUTH_SCOPES,
      state: stateToken,
      prompt: 'consent' // Force consent to ensure refresh token
    });

    console.log(`🔗 Generated auth URL for Telegram user: ${telegramUserId}`);
    return authUrl;
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(code: string, state: string): Promise<AuthResult> {
    try {
      if (!this.oauth2Client) {
        return {
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'OAuth not configured'
          }
        };
      }

      // Verify state parameter
      const authState = this.verifyState(state);
      if (!authState) {
        return {
          success: false,
          error: {
            code: 'INVALID_STATE',
            message: 'Invalid or expired authentication state'
          }
        };
      }

      // Exchange code for tokens
      const { tokens } = await this.oauth2Client.getToken(code);
      
      if (!tokens.access_token) {
        return {
          success: false,
          error: {
            code: 'OAUTH_CALLBACK_ERROR',
            message: 'Failed to obtain access token'
          }
        };
      }

      // Create user session
      const session: UserSession = {
        telegramUserId: authState.telegramUserId,
        googleTokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || undefined,
          scope: tokens.scope || GOOGLE_OAUTH_SCOPES.join(' '),
          token_type: tokens.token_type || 'Bearer',
          expiry_date: tokens.expiry_date || undefined
        },
        isAuthenticated: true,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        calendarPreferences: { ...DEFAULT_CALENDAR_PREFERENCES }
      };

      // Clean up state
      this.pendingStates.delete(state);

      console.log(`✅ OAuth callback successful for user: ${authState.telegramUserId}`);
      
      return {
        success: true,
        session
      };

    } catch (error) {
      console.error('❌ OAuth callback failed:', error);
      
      return {
        success: false,
        error: {
          code: 'OAUTH_CALLBACK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown OAuth error',
          details: {
            originalError: String(error)
          }
        }
      };
    }
  }

  /**
   * Refresh expired access token using refresh token
   */
  async refreshTokens(tokens: OAuthTokens): Promise<AuthResult> {
    try {
      if (!this.oauth2Client || !tokens.refresh_token) {
        return {
          success: false,
          error: {
            code: 'REFRESH_FAILED',
            message: 'No refresh token available'
          }
        };
      }

      // Set credentials for refresh
      this.oauth2Client.setCredentials({
        refresh_token: tokens.refresh_token || null
      });

      // Refresh access token
      const { credentials } = await this.oauth2Client.refreshAccessToken();

      const refreshedTokens: OAuthTokens = {
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token || tokens.refresh_token,
        scope: tokens.scope,
        token_type: credentials.token_type || 'Bearer',
        expiry_date: credentials.expiry_date || undefined
      };

      console.log('🔄 Tokens refreshed successfully');

      return {
        success: true,
        session: {
          telegramUserId: '', // Will be set by caller
          googleTokens: refreshedTokens,
          isAuthenticated: true,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          calendarPreferences: { ...DEFAULT_CALENDAR_PREFERENCES }
        }
      };

    } catch (error) {
      console.error('❌ Token refresh failed:', error);
      
      return {
        success: false,
        error: {
          code: 'REFRESH_FAILED',
          message: error instanceof Error ? error.message : 'Token refresh failed',
          details: {
            originalError: String(error)
          }
        }
      };
    }
  }

  /**
   * Check if tokens are expired or close to expiry
   */
  isTokenExpired(tokens: OAuthTokens, thresholdMs: number = 5 * 60 * 1000): boolean {
    if (!tokens.expiry_date) {
      return false; // Assume valid if no expiry date
    }

    const now = Date.now();
    const expiryTime = tokens.expiry_date;
    
    return (expiryTime - now) <= thresholdMs;
  }

  /**
   * Revoke user's Google OAuth tokens
   */
  async revokeTokens(tokens: OAuthTokens): Promise<boolean> {
    try {
      if (!this.oauth2Client) {
        return false;
      }

      this.oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token
      });

      await this.oauth2Client.revokeCredentials();
      console.log('✅ Tokens revoked successfully');
      return true;

    } catch (error) {
      console.error('❌ Token revocation failed:', error);
      return false;
    }
  }

  /**
   * Verify state parameter from OAuth callback
   */
  private verifyState(stateToken: string): AuthState | null {
    try {
      const authState = this.pendingStates.get(stateToken);
      if (!authState) {
        return null;
      }

      // Check if state is expired (10 minutes)
      const now = Date.now();
      if (now - authState.timestamp > 10 * 60 * 1000) {
        this.pendingStates.delete(stateToken);
        return null;
      }

      return authState;
    } catch (error) {
      console.error('❌ State verification failed:', error);
      return null;
    }
  }

  /**
   * Clean up expired authentication states
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    const expiredThreshold = 10 * 60 * 1000; // 10 minutes

    for (const [token, state] of this.pendingStates.entries()) {
      if (now - state.timestamp > expiredThreshold) {
        this.pendingStates.delete(token);
      }
    }
  }

  /**
   * Get OAuth client configured with user tokens
   */
  getAuthenticatedClient(tokens: OAuthTokens): any {
    if (!this.oauth2Client) {
      throw new Error('OAuth not configured');
    }

    const client = new google.auth.OAuth2(
      this.credentials.client_id,
      this.credentials.client_secret,
      this.credentials.redirect_uri
    );

    client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date
    });

    return client;
  }

  /**
   * Check if OAuth is properly configured
   */
  isConfigured(): boolean {
    return !!this.oauth2Client;
  }
}