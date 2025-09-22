import { UserSessionManager } from './userSessionManager.js';

/**
 * Shared singleton session manager to ensure consistent session state
 * across all route modules (telegram.ts and calendar.ts)
 */
let sharedSessionManager: UserSessionManager | undefined;

/**
 * Get the shared singleton session manager instance
 * This ensures both telegram and calendar routes use the same session store
 */
export function getSharedSessionManager(): UserSessionManager {
  if (!sharedSessionManager) {
    console.log('📝 Initializing shared session manager singleton');
    sharedSessionManager = new UserSessionManager();
  }
  return sharedSessionManager;
}

/**
 * Reset the shared session manager (useful for testing)
 */
export function resetSharedSessionManager(): void {
  sharedSessionManager = undefined;
}