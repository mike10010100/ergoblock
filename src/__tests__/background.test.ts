import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Declare global for Node.js environment
declare const globalThis: {
  chrome: typeof chrome;
  fetch: typeof fetch;
};

// Types for mocking
interface AuthData {
  accessJwt: string;
  did: string;
  pdsUrl: string;
}

// Mock storage state
let mockSyncStorage: Record<string, unknown> = {};
let mockLocalStorage: Record<string, unknown> = {};
let alarmListeners: Array<(alarm: { name: string }) => void> = [];
let messageListeners: Array<
  (
    message: Record<string, unknown>,
    sender: unknown,
    sendResponse: (response: unknown) => void
  ) => boolean | void
> = [];
let installedListeners: Array<() => void> = [];
let startupListeners: Array<() => void> = [];

// Create mock functions
const mockSetBadgeText = vi.fn().mockResolvedValue(undefined);
const mockSetBadgeBackgroundColor = vi.fn().mockResolvedValue(undefined);
const mockNotificationsCreate = vi.fn().mockResolvedValue('notification-id');
const mockAlarmsCreate = vi.fn().mockResolvedValue(undefined);
const mockAlarmsClear = vi.fn().mockResolvedValue(undefined);

const createMockChrome = () => ({
  action: {
    setBadgeText: mockSetBadgeText,
    setBadgeBackgroundColor: mockSetBadgeBackgroundColor,
  },
  storage: {
    sync: {
      get: vi.fn((key: string) => {
        if (typeof key === 'string') {
          return Promise.resolve({ [key]: mockSyncStorage[key] });
        }
        return Promise.resolve(mockSyncStorage);
      }),
      set: vi.fn((data: Record<string, unknown>) => {
        Object.assign(mockSyncStorage, data);
        return Promise.resolve();
      }),
    },
    local: {
      get: vi.fn((key: string) => {
        if (typeof key === 'string') {
          return Promise.resolve({ [key]: mockLocalStorage[key] });
        }
        return Promise.resolve(mockLocalStorage);
      }),
      set: vi.fn((data: Record<string, unknown>) => {
        Object.assign(mockLocalStorage, data);
        return Promise.resolve();
      }),
    },
  },
  alarms: {
    create: mockAlarmsCreate,
    clear: mockAlarmsClear,
    onAlarm: {
      addListener: vi.fn((listener: (alarm: { name: string }) => void) => {
        alarmListeners.push(listener);
      }),
    },
  },
  notifications: {
    create: mockNotificationsCreate,
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onMessage: {
      addListener: vi.fn(
        (
          listener: (
            message: Record<string, unknown>,
            sender: unknown,
            sendResponse: (response: unknown) => void
          ) => boolean | void
        ) => {
          messageListeners.push(listener);
        }
      ),
    },
    onInstalled: {
      addListener: vi.fn((listener: () => void) => {
        installedListeners.push(listener);
      }),
    },
    onStartup: {
      addListener: vi.fn((listener: () => void) => {
        startupListeners.push(listener);
      }),
    },
  },
});

// Mock fetch
const mockFetch = vi.fn();

describe('background service worker', () => {
  let mockChrome: ReturnType<typeof createMockChrome>;

  beforeEach(() => {
    // Reset storage
    mockSyncStorage = {};
    mockLocalStorage = {};

    // Reset listeners
    alarmListeners = [];
    messageListeners = [];
    installedListeners = [];
    startupListeners = [];

    // Reset all mocks
    vi.clearAllMocks();
    vi.resetModules();

    // Create fresh mock chrome
    mockChrome = createMockChrome();
    globalThis.chrome = mockChrome as unknown as typeof chrome;

    // Mock fetch
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Chrome API initialization', () => {
    it('should have chrome APIs defined', () => {
      expect(globalThis.chrome).toBeDefined();
      expect(globalThis.chrome.action).toBeDefined();
      expect(globalThis.chrome.storage).toBeDefined();
      expect(globalThis.chrome.alarms).toBeDefined();
      expect(globalThis.chrome.notifications).toBeDefined();
      expect(globalThis.chrome.runtime).toBeDefined();
    });

    it('should register alarm listener', async () => {
      await import('../background');
      expect(mockChrome.alarms.onAlarm.addListener).toHaveBeenCalled();
    });

    it('should register message listener', async () => {
      await import('../background');
      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    it('should register onInstalled listener', async () => {
      await import('../background');
      expect(mockChrome.runtime.onInstalled.addListener).toHaveBeenCalled();
    });

    it('should register onStartup listener', async () => {
      await import('../background');
      expect(mockChrome.runtime.onStartup.addListener).toHaveBeenCalled();
    });
  });

  describe('setupAlarm', () => {
    it('should set up alarm with default interval', async () => {
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };

      await import('../background');

      // Trigger onInstalled
      for (const listener of installedListeners) {
        listener();
      }

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAlarmsClear).toHaveBeenCalledWith('checkExpirations');
      expect(mockAlarmsCreate).toHaveBeenCalledWith('checkExpirations', {
        periodInMinutes: 1,
      });
    });

    it('should clamp interval to minimum of 1 minute', async () => {
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 0,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };

      await import('../background');

      for (const listener of installedListeners) {
        listener();
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAlarmsCreate).toHaveBeenCalledWith('checkExpirations', {
        periodInMinutes: 1,
      });
    });

    it('should clamp interval to maximum of 10 minutes', async () => {
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 15,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };

      await import('../background');

      for (const listener of installedListeners) {
        listener();
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAlarmsCreate).toHaveBeenCalledWith('checkExpirations', {
        periodInMinutes: 10,
      });
    });
  });

  describe('updateBadge', () => {
    it('should show badge count when enabled', async () => {
      mockLocalStorage['extensionOptions'] = {
        showBadgeCount: true,
        checkInterval: 1,
        notificationsEnabled: true,
        notificationSound: false,
      };
      mockSyncStorage['tempBlocks'] = {
        'did:plc:user1': { handle: 'user1', expiresAt: Date.now() + 10000, createdAt: Date.now() },
      };
      mockSyncStorage['tempMutes'] = {
        'did:plc:user2': { handle: 'user2', expiresAt: Date.now() + 10000, createdAt: Date.now() },
      };

      await import('../background');

      for (const listener of installedListeners) {
        listener();
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '2' });
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#1185fe' });
    });

    it('should hide badge when disabled', async () => {
      mockLocalStorage['extensionOptions'] = {
        showBadgeCount: false,
        checkInterval: 1,
        notificationsEnabled: true,
        notificationSound: false,
      };

      await import('../background');

      for (const listener of installedListeners) {
        listener();
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' });
    });

    it('should show empty badge when no blocks/mutes', async () => {
      mockLocalStorage['extensionOptions'] = {
        showBadgeCount: true,
        checkInterval: 1,
        notificationsEnabled: true,
        notificationSound: false,
      };
      mockSyncStorage['tempBlocks'] = {};
      mockSyncStorage['tempMutes'] = {};

      await import('../background');

      for (const listener of installedListeners) {
        listener();
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' });
    });
  });

  describe('message handling', () => {
    it('should handle TEMP_BLOCK_ADDED message', async () => {
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };

      await import('../background');

      const sendResponse = vi.fn();
      for (const listener of messageListeners) {
        listener({ type: 'TEMP_BLOCK_ADDED', did: 'did:plc:test' }, {}, sendResponse);
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should trigger setupAlarm and updateBadge
      expect(mockAlarmsClear).toHaveBeenCalled();
      expect(mockAlarmsCreate).toHaveBeenCalled();
    });

    it('should handle TEMP_MUTE_ADDED message', async () => {
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };

      await import('../background');

      const sendResponse = vi.fn();
      for (const listener of messageListeners) {
        listener({ type: 'TEMP_MUTE_ADDED', did: 'did:plc:test' }, {}, sendResponse);
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAlarmsClear).toHaveBeenCalled();
      expect(mockAlarmsCreate).toHaveBeenCalled();
    });

    it('should handle SET_AUTH_TOKEN message', async () => {
      await import('../background');

      const authData: AuthData = {
        accessJwt: 'test-token',
        did: 'did:plc:testuser',
        pdsUrl: 'https://bsky.social',
      };

      const sendResponse = vi.fn();
      for (const listener of messageListeners) {
        listener({ type: 'SET_AUTH_TOKEN', auth: authData }, {}, sendResponse);
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({ authToken: authData });
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('should handle CHECK_NOW message', async () => {
      mockLocalStorage['authToken'] = {
        accessJwt: 'test-token',
        did: 'did:plc:owner',
        pdsUrl: 'https://bsky.social',
      };
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };
      mockSyncStorage['tempBlocks'] = {};
      mockSyncStorage['tempMutes'] = {};

      await import('../background');

      const sendResponse = vi.fn();
      let returnValue: boolean | void = false;
      for (const listener of messageListeners) {
        returnValue = listener({ type: 'CHECK_NOW' }, {}, sendResponse);
      }

      // Should return true for async response
      expect(returnValue).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('checkExpirations', () => {
    it('should skip if no auth token', async () => {
      mockLocalStorage['authToken'] = null;
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };

      await import('../background');

      // Trigger alarm
      for (const listener of alarmListeners) {
        listener({ name: 'checkExpirations' });
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not call fetch since no auth
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip if auth token is incomplete', async () => {
      mockLocalStorage['authToken'] = {
        accessJwt: 'test-token',
        // Missing did and pdsUrl
      };
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };

      await import('../background');

      for (const listener of alarmListeners) {
        listener({ name: 'checkExpirations' });
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should process expired blocks', async () => {
      const now = Date.now();
      mockLocalStorage['authToken'] = {
        accessJwt: 'test-token',
        did: 'did:plc:owner',
        pdsUrl: 'https://bsky.social',
      };
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };
      mockSyncStorage['tempBlocks'] = {
        'did:plc:expired': {
          handle: 'expired.bsky.social',
          expiresAt: now - 1000,
          createdAt: now - 10000,
        },
      };
      mockSyncStorage['tempMutes'] = {};

      // Mock API responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                records: [
                  {
                    uri: 'at://did:plc:owner/app.bsky.graph.block/abc123',
                    value: { subject: 'did:plc:expired' },
                  },
                ],
              })
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(''),
        });

      await import('../background');

      for (const listener of alarmListeners) {
        listener({ name: 'checkExpirations' });
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have called API to list records and delete
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('com.atproto.repo.listRecords'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('com.atproto.repo.deleteRecord'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should process expired mutes', async () => {
      const now = Date.now();
      mockLocalStorage['authToken'] = {
        accessJwt: 'test-token',
        did: 'did:plc:owner',
        pdsUrl: 'https://bsky.social',
      };
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };
      mockSyncStorage['tempBlocks'] = {};
      mockSyncStorage['tempMutes'] = {
        'did:plc:expired': {
          handle: 'expired.bsky.social',
          expiresAt: now - 1000,
          createdAt: now - 10000,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(''),
      });

      await import('../background');

      for (const listener of alarmListeners) {
        listener({ name: 'checkExpirations' });
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('app.bsky.graph.unmuteActor'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should send notification on successful expiration', async () => {
      const now = Date.now();
      mockLocalStorage['authToken'] = {
        accessJwt: 'test-token',
        did: 'did:plc:owner',
        pdsUrl: 'https://bsky.social',
      };
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };
      mockSyncStorage['tempBlocks'] = {};
      mockSyncStorage['tempMutes'] = {
        'did:plc:expired': {
          handle: 'expired.bsky.social',
          expiresAt: now - 1000,
          createdAt: now - 10000,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(''),
      });

      await import('../background');

      for (const listener of alarmListeners) {
        listener({ name: 'checkExpirations' });
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockNotificationsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'basic',
          title: '✅ Temporary action expired',
          message: expect.stringContaining('expired.bsky.social'),
        })
      );
    });

    it('should not send notification when disabled', async () => {
      const now = Date.now();
      mockLocalStorage['authToken'] = {
        accessJwt: 'test-token',
        did: 'did:plc:owner',
        pdsUrl: 'https://bsky.social',
      };
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: false, // Disabled
        notificationSound: false,
      };
      mockSyncStorage['tempBlocks'] = {};
      mockSyncStorage['tempMutes'] = {
        'did:plc:expired': {
          handle: 'expired.bsky.social',
          expiresAt: now - 1000,
          createdAt: now - 10000,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(''),
      });

      await import('../background');

      for (const listener of alarmListeners) {
        listener({ name: 'checkExpirations' });
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockNotificationsCreate).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      const now = Date.now();
      mockLocalStorage['authToken'] = {
        accessJwt: 'test-token',
        did: 'did:plc:owner',
        pdsUrl: 'https://bsky.social',
      };
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };
      mockSyncStorage['tempBlocks'] = {
        'did:plc:expired': {
          handle: 'expired.bsky.social',
          expiresAt: now - 1000,
          createdAt: now - 10000,
        },
      };
      mockSyncStorage['tempMutes'] = {};

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Unauthorized' }),
      });

      await import('../background');

      for (const listener of alarmListeners) {
        listener({ name: 'checkExpirations' });
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should send failure notification
      expect(mockNotificationsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '⚠️ Action failed',
        })
      );
    });

    it('should not process non-expired entries', async () => {
      const now = Date.now();
      mockLocalStorage['authToken'] = {
        accessJwt: 'test-token',
        did: 'did:plc:owner',
        pdsUrl: 'https://bsky.social',
      };
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };
      mockSyncStorage['tempBlocks'] = {
        'did:plc:active': {
          handle: 'active.bsky.social',
          expiresAt: now + 3600000, // Still active
          createdAt: now,
        },
      };
      mockSyncStorage['tempMutes'] = {};

      await import('../background');

      for (const listener of alarmListeners) {
        listener({ name: 'checkExpirations' });
      }

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not call any API for non-expired entries
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should ignore alarms with different names', async () => {
      mockLocalStorage['authToken'] = {
        accessJwt: 'test-token',
        did: 'did:plc:owner',
        pdsUrl: 'https://bsky.social',
      };

      await import('../background');

      for (const listener of alarmListeners) {
        listener({ name: 'someOtherAlarm' });
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not process anything for other alarms
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('API request handling', () => {
    it('should use correct PDS URL', async () => {
      const now = Date.now();
      const customPdsUrl = 'https://custom.pds.example';
      mockLocalStorage['authToken'] = {
        accessJwt: 'test-token',
        did: 'did:plc:owner',
        pdsUrl: customPdsUrl,
      };
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };
      mockSyncStorage['tempBlocks'] = {};
      mockSyncStorage['tempMutes'] = {
        'did:plc:expired': {
          handle: 'expired.bsky.social',
          expiresAt: now - 1000,
          createdAt: now - 10000,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(''),
      });

      await import('../background');

      for (const listener of alarmListeners) {
        listener({ name: 'checkExpirations' });
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(customPdsUrl),
        expect.any(Object)
      );
    });

    it('should include authorization header', async () => {
      const now = Date.now();
      mockLocalStorage['authToken'] = {
        accessJwt: 'my-secret-token',
        did: 'did:plc:owner',
        pdsUrl: 'https://bsky.social',
      };
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };
      mockSyncStorage['tempBlocks'] = {};
      mockSyncStorage['tempMutes'] = {
        'did:plc:expired': {
          handle: 'expired.bsky.social',
          expiresAt: now - 1000,
          createdAt: now - 10000,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(''),
      });

      await import('../background');

      for (const listener of alarmListeners) {
        listener({ name: 'checkExpirations' });
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-secret-token',
          }),
        })
      );
    });

    it('should handle block not found gracefully', async () => {
      const now = Date.now();
      mockLocalStorage['authToken'] = {
        accessJwt: 'test-token',
        did: 'did:plc:owner',
        pdsUrl: 'https://bsky.social',
      };
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };
      mockSyncStorage['tempBlocks'] = {
        'did:plc:expired': {
          handle: 'expired.bsky.social',
          expiresAt: now - 1000,
          createdAt: now - 10000,
        },
      };
      mockSyncStorage['tempMutes'] = {};

      // Return empty records (block already removed)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              records: [],
            })
          ),
      });

      await import('../background');

      for (const listener of alarmListeners) {
        listener({ name: 'checkExpirations' });
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should only call listRecords, not deleteRecord
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('notification sound setting', () => {
    it('should respect notification sound setting', async () => {
      const now = Date.now();
      mockLocalStorage['authToken'] = {
        accessJwt: 'test-token',
        did: 'did:plc:owner',
        pdsUrl: 'https://bsky.social',
      };
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: true, // Sound enabled
      };
      mockSyncStorage['tempBlocks'] = {};
      mockSyncStorage['tempMutes'] = {
        'did:plc:expired': {
          handle: 'expired.bsky.social',
          expiresAt: now - 1000,
          createdAt: now - 10000,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(''),
      });

      await import('../background');

      for (const listener of alarmListeners) {
        listener({ name: 'checkExpirations' });
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockNotificationsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          silent: false,
        })
      );
    });
  });

  describe('onStartup handler', () => {
    it('should set up alarm and update badge on startup', async () => {
      mockLocalStorage['extensionOptions'] = {
        checkInterval: 1,
        showBadgeCount: true,
        notificationsEnabled: true,
        notificationSound: false,
      };

      await import('../background');

      for (const listener of startupListeners) {
        listener();
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAlarmsClear).toHaveBeenCalled();
      expect(mockAlarmsCreate).toHaveBeenCalled();
    });
  });
});
