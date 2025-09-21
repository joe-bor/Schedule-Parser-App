/**
 * Google Calendar service for creating and managing calendar events
 */

import { google, calendar_v3 } from 'googleapis';
import type { 
  CalendarEvent, 
  CalendarEventRequest, 
  CalendarCreationResult, 
  BatchCalendarCreationResult,
  CalendarConfig,
  CalendarListEntry,
  CalendarQuotaInfo
} from '../types/calendar.js';
import type { OAuthTokens } from '../types/auth.js';
import { DEFAULT_CALENDAR_CONFIG } from '../types/calendar.js';
import { AuthService } from './authService.js';

export class CalendarService {
  private authService: AuthService;
  private config: CalendarConfig;

  constructor(config?: Partial<CalendarConfig>) {
    this.authService = new AuthService();
    this.config = { ...DEFAULT_CALENDAR_CONFIG, ...config };
  }

  /**
   * Create a single calendar event
   */
  async createEvent(
    eventRequest: CalendarEventRequest, 
    userTokens: OAuthTokens
  ): Promise<CalendarCreationResult> {
    try {
      const calendar = await this.getCalendarClient(userTokens);
      
      // Convert request to Google Calendar format
      const calendarEvent: calendar_v3.Schema$Event = {
        summary: eventRequest.summary,
        description: eventRequest.description || undefined,
        start: {
          dateTime: eventRequest.startDateTime,
          timeZone: eventRequest.timeZone || this.config.timeZone || undefined
        },
        end: {
          dateTime: eventRequest.endDateTime,
          timeZone: eventRequest.timeZone || this.config.timeZone || undefined
        },
        location: eventRequest.location || undefined,
        colorId: eventRequest.colorId || undefined,
        attendees: eventRequest.attendeeEmails?.map(email => ({ email })) || undefined,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 15 }
          ]
        }
      };

      // Check for conflicts if enabled
      if (this.config.conflictDetection) {
        const hasConflict = await this.checkForConflicts(
          eventRequest.startDateTime,
          eventRequest.endDateTime,
          userTokens
        );
        
        if (hasConflict) {
          console.warn(`⚠️ Potential calendar conflict detected for event: ${eventRequest.summary}`);
        }
      }

      // Create the event
      const response = await calendar.events.insert({
        calendarId: this.config.calendarId || 'primary',
        resource: calendarEvent,
        sendNotifications: this.config.sendNotifications,
        sendUpdates: this.config.sendUpdates
      });

      const eventData = response.data;
      if (!eventData?.id) {
        throw new Error('Event creation failed - no event ID returned');
      }

      console.log(`✅ Calendar event created: ${eventData.id} - ${eventRequest.summary}`);

      return {
        success: true,
        event: this.convertToCalendarEvent(eventData),
        eventId: eventData.id,
        htmlLink: eventData.htmlLink || undefined,
        calendarId: this.config.calendarId
      };

    } catch (error) {
      console.error('❌ Calendar event creation failed:', error);
      
      return {
        success: false,
        error: this.getErrorMessage(error)
      };
    }
  }

  /**
   * Create multiple calendar events in batch
   */
  async createMultipleEvents(
    eventRequests: CalendarEventRequest[], 
    userTokens: OAuthTokens
  ): Promise<BatchCalendarCreationResult> {
    const result: BatchCalendarCreationResult = {
      totalEvents: eventRequests.length,
      successfulEvents: [],
      failedEvents: [],
      success: false,
      summary: {
        created: 0,
        failed: 0,
        totalAttempted: eventRequests.length
      }
    };

    // Process events in batches to avoid rate limits
    const batchSize = this.config.batchSize || 10;
    const batches = this.chunkArray(eventRequests, batchSize);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`📅 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} events)`);

      // Process batch with delay between batches to respect rate limits
      const batchPromises = batch.map(async (eventRequest) => {
        const createResult = await this.createEvent(eventRequest, userTokens);
        
        if (createResult.success && createResult.event) {
          result.successfulEvents.push(createResult.event);
          result.summary.created++;
        } else {
          result.failedEvents.push({
            event: eventRequest,
            error: createResult.error || 'Unknown error'
          });
          result.summary.failed++;
        }
      });

      await Promise.all(batchPromises);

      // Add delay between batches to avoid rate limiting
      if (batchIndex < batches.length - 1) {
        await this.delay(1000); // 1 second delay between batches
      }
    }

    result.success = result.summary.created > 0;
    
    console.log(`📊 Batch creation complete: ${result.summary.created} created, ${result.summary.failed} failed`);
    
    return result;
  }

  /**
   * Get user's calendar list
   */
  async getCalendarList(userTokens: OAuthTokens): Promise<CalendarListEntry[]> {
    try {
      const calendar = await this.getCalendarClient(userTokens);
      
      const response = await calendar.calendarList.list({
        minAccessRole: 'writer' // Only calendars user can write to
      });

      const calendars: CalendarListEntry[] = response.data.items?.map(item => ({
        id: item.id!,
        summary: item.summary!,
        description: item.description,
        timeZone: item.timeZone!,
        accessRole: item.accessRole as CalendarListEntry['accessRole'],
        primary: item.primary,
        selected: item.selected,
        backgroundColor: item.backgroundColor,
        foregroundColor: item.foregroundColor
      })) || [];

      console.log(`📋 Retrieved ${calendars.length} calendars for user`);
      return calendars;

    } catch (error) {
      console.error('❌ Failed to get calendar list:', error);
      return [];
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(eventId: string, userTokens: OAuthTokens): Promise<boolean> {
    try {
      const calendar = await this.getCalendarClient(userTokens);
      
      await calendar.events.delete({
        calendarId: this.config.calendarId,
        eventId: eventId
      });

      console.log(`🗑️ Calendar event deleted: ${eventId}`);
      return true;

    } catch (error) {
      console.error('❌ Failed to delete calendar event:', error);
      return false;
    }
  }

  /**
   * Update a calendar event
   */
  async updateEvent(
    eventId: string, 
    eventRequest: CalendarEventRequest, 
    userTokens: OAuthTokens
  ): Promise<CalendarCreationResult> {
    try {
      const calendar = await this.getCalendarClient(userTokens);
      
      const calendarEvent: calendar_v3.Schema$Event = {
        summary: eventRequest.summary,
        description: eventRequest.description,
        start: {
          dateTime: eventRequest.startDateTime,
          timeZone: eventRequest.timeZone || this.config.timeZone
        },
        end: {
          dateTime: eventRequest.endDateTime,
          timeZone: eventRequest.timeZone || this.config.timeZone
        },
        location: eventRequest.location,
        colorId: eventRequest.colorId
      };

      const response = await calendar.events.update({
        calendarId: this.config.calendarId,
        eventId: eventId,
        resource: calendarEvent,
        sendNotifications: this.config.sendNotifications,
        sendUpdates: this.config.sendUpdates
      });

      console.log(`✏️ Calendar event updated: ${eventId}`);

      return {
        success: true,
        event: this.convertToCalendarEvent(response.data),
        eventId: response.data.id || eventId,
        htmlLink: response.data.htmlLink || undefined
      };

    } catch (error) {
      console.error('❌ Calendar event update failed:', error);
      
      return {
        success: false,
        error: this.getErrorMessage(error)
      };
    }
  }

  /**
   * Check for conflicting events in the specified time range
   */
  private async checkForConflicts(
    startDateTime: string, 
    endDateTime: string, 
    userTokens: OAuthTokens
  ): Promise<boolean> {
    try {
      const calendar = await this.getCalendarClient(userTokens);
      
      const response = await calendar.events.list({
        calendarId: this.config.calendarId || 'primary',
        timeMin: startDateTime,
        timeMax: endDateTime,
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = response.data?.items || [];
      return events.length > 0;

    } catch (error) {
      console.error('❌ Conflict check failed:', error);
      return false; // Assume no conflict if check fails
    }
  }

  /**
   * Get authenticated Google Calendar client
   */
  private async getCalendarClient(userTokens: OAuthTokens): Promise<calendar_v3.Calendar> {
    const authClient = this.authService.getAuthenticatedClient(userTokens);
    return google.calendar({ version: 'v3', auth: authClient });
  }

  /**
   * Convert Google Calendar API response to our CalendarEvent type
   */
  private convertToCalendarEvent(googleEvent: calendar_v3.Schema$Event): CalendarEvent {
    return {
      id: googleEvent.id || undefined,
      summary: googleEvent.summary || 'Untitled Event',
      description: googleEvent.description || undefined,
      start: {
        dateTime: googleEvent.start?.dateTime || '',
        timeZone: googleEvent.start?.timeZone || undefined
      },
      end: {
        dateTime: googleEvent.end?.dateTime || '',
        timeZone: googleEvent.end?.timeZone || undefined
      },
      location: googleEvent.location || undefined,
      attendees: googleEvent.attendees?.map(attendee => ({
        email: attendee.email || '',
        displayName: attendee.displayName || undefined
      })) || undefined,
      colorId: googleEvent.colorId || undefined,
      transparency: (googleEvent.transparency as 'opaque' | 'transparent') || undefined,
      visibility: (googleEvent.visibility as 'default' | 'public' | 'private') || undefined
    };
  }

  /**
   * Extract error message from Google API error
   */
  private getErrorMessage(error: any): string {
    if (error?.response?.data?.error) {
      const apiError = error.response.data.error;
      return `${apiError.message} (Code: ${apiError.code})`;
    }
    
    if (error?.message) {
      return error.message;
    }
    
    return 'Unknown calendar service error';
  }

  /**
   * Split array into chunks of specified size
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Add delay for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update calendar configuration
   */
  updateConfig(newConfig: Partial<CalendarConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('📝 Calendar service configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): CalendarConfig {
    return { ...this.config };
  }
}