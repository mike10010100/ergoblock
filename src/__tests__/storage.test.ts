import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getTempBlocks,
  getTempMutes,
  addTempBlock,
  addTempMute,
  removeTempBlock,
  removeTempMute,
  getOptions,
  setOptions,
  getActionHistory,
  addHistoryEntry,
  removeAllExpiredBlocks,
  removeAllExpiredMutes,
} from '../storage';
import { DEFAULT_OPTIONS, type ExtensionOptions, type HistoryEntry } from '../types';

// Declare global for Node.js environment
declare const globalThis: {
  chrome: typeof chrome;
};

// Type for storage data
interface TempBlockData {
  handle: string;
  expiresAt: number;
  createdAt: number;
}

interface StorageSetData {
  tempBlocks?: Record<string, TempBlockData>;
  tempMutes?: Record<string, TempBlockData>;
  extensionOptions?: ExtensionOptions;
  actionHistory?: HistoryEntry[];
}

// Mock chrome.storage and chrome.runtime
const mockSyncStorage: Record<string, unknown> = {};
const mockLocalStorage: Record<string, unknown> = {};

const mockChrome = {
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
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
};

describe('storage module', () => {
  beforeEach(() => {
    // Clear mock storage
    Object.keys(mockSyncStorage).forEach((key) => delete mockSyncStorage[key]);
    Object.keys(mockLocalStorage).forEach((key) => delete mockLocalStorage[key]);

    // Reset all mocks
    vi.clearAllMocks();

    // Set up global chrome mock
    globalThis.chrome = mockChrome as unknown as typeof chrome;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTempBlocks', () => {
    it('should return empty object when no blocks exist', async () => {
      const blocks = await getTempBlocks();
      expect(blocks).toEqual({});
    });

    it('should return stored blocks', async () => {
      const storedBlocks = {
        'did:plc:user1': {
          handle: 'user1.bsky.social',
          expiresAt: Date.now() + 3600000,
          createdAt: Date.now(),
        },
      };
      mockSyncStorage['tempBlocks'] = storedBlocks;

      const blocks = await getTempBlocks();
      expect(blocks).toEqual(storedBlocks);
    });

    it('should return multiple blocks', async () => {
      const storedBlocks = {
        'did:plc:user1': {
          handle: 'user1.bsky.social',
          expiresAt: Date.now() + 3600000,
          createdAt: Date.now(),
        },
        'did:plc:user2': {
          handle: 'user2.bsky.social',
          expiresAt: Date.now() + 7200000,
          createdAt: Date.now(),
        },
      };
      mockSyncStorage['tempBlocks'] = storedBlocks;

      const blocks = await getTempBlocks();
      expect(Object.keys(blocks)).toHaveLength(2);
    });
  });

  describe('getTempMutes', () => {
    it('should return empty object when no mutes exist', async () => {
      const mutes = await getTempMutes();
      expect(mutes).toEqual({});
    });

    it('should return stored mutes', async () => {
      const storedMutes = {
        'did:plc:user1': {
          handle: 'user1.bsky.social',
          expiresAt: Date.now() + 3600000,
          createdAt: Date.now(),
        },
      };
      mockSyncStorage['tempMutes'] = storedMutes;

      const mutes = await getTempMutes();
      expect(mutes).toEqual(storedMutes);
    });
  });

  describe('addTempBlock', () => {
    it('should add a temp block with default duration', async () => {
      const did = 'did:plc:testuser';
      const handle = 'testuser.bsky.social';

      await addTempBlock(did, handle);

      expect(mockChrome.storage.sync.set).toHaveBeenCalled();
      const setCall = mockChrome.storage.sync.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.tempBlocks?.[did]).toBeDefined();
      expect(setCall.tempBlocks?.[did].handle).toBe(handle);
      // Default duration is 24 hours (86400000ms)
      expect(setCall.tempBlocks?.[did].expiresAt).toBeGreaterThan(Date.now());
    });

    it('should add a temp block with custom duration', async () => {
      const did = 'did:plc:testuser';
      const handle = 'testuser.bsky.social';
      const durationMs = 3600000; // 1 hour

      const beforeTime = Date.now();
      await addTempBlock(did, handle, durationMs);
      const afterTime = Date.now();

      const setCall = mockChrome.storage.sync.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.tempBlocks?.[did].expiresAt).toBeGreaterThanOrEqual(beforeTime + durationMs);
      expect(setCall.tempBlocks?.[did].expiresAt).toBeLessThanOrEqual(afterTime + durationMs);
    });

    it('should send message to background when block is added', async () => {
      const did = 'did:plc:testuser';
      const handle = 'testuser.bsky.social';

      await addTempBlock(did, handle);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TEMP_BLOCK_ADDED',
          did,
        })
      );
    });

    it('should preserve existing blocks when adding new one', async () => {
      mockSyncStorage['tempBlocks'] = {
        'did:plc:existing': {
          handle: 'existing.bsky.social',
          expiresAt: Date.now() + 3600000,
          createdAt: Date.now(),
        },
      };

      await addTempBlock('did:plc:newuser', 'newuser.bsky.social');

      const setCall = mockChrome.storage.sync.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.tempBlocks?.['did:plc:existing']).toBeDefined();
      expect(setCall.tempBlocks?.['did:plc:newuser']).toBeDefined();
    });

    it('should update existing block if same user is blocked again', async () => {
      const did = 'did:plc:testuser';
      mockSyncStorage['tempBlocks'] = {
        [did]: {
          handle: 'testuser.bsky.social',
          expiresAt: Date.now() + 1000,
          createdAt: Date.now() - 10000,
        },
      };

      await addTempBlock(did, 'testuser.bsky.social', 7200000);

      const setCall = mockChrome.storage.sync.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.tempBlocks?.[did].expiresAt).toBeGreaterThan(Date.now() + 7000000);
    });
  });

  describe('addTempMute', () => {
    it('should add a temp mute with default duration', async () => {
      const did = 'did:plc:testuser';
      const handle = 'testuser.bsky.social';

      await addTempMute(did, handle);

      expect(mockChrome.storage.sync.set).toHaveBeenCalled();
      const setCall = mockChrome.storage.sync.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.tempMutes?.[did]).toBeDefined();
      expect(setCall.tempMutes?.[did].handle).toBe(handle);
    });

    it('should add a temp mute with custom duration', async () => {
      const did = 'did:plc:testuser';
      const handle = 'testuser.bsky.social';
      const durationMs = 21600000; // 6 hours

      await addTempMute(did, handle, durationMs);

      const setCall = mockChrome.storage.sync.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.tempMutes?.[did].expiresAt).toBeGreaterThan(Date.now() + 21000000);
    });

    it('should send message to background when mute is added', async () => {
      const did = 'did:plc:testuser';
      const handle = 'testuser.bsky.social';

      await addTempMute(did, handle);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TEMP_MUTE_ADDED',
          did,
        })
      );
    });
  });

  describe('removeTempBlock', () => {
    it('should remove a temp block', async () => {
      const did = 'did:plc:testuser';
      mockSyncStorage['tempBlocks'] = {
        [did]: {
          handle: 'testuser.bsky.social',
          expiresAt: Date.now() + 3600000,
          createdAt: Date.now(),
        },
        'did:plc:other': {
          handle: 'other.bsky.social',
          expiresAt: Date.now() + 3600000,
          createdAt: Date.now(),
        },
      };

      await removeTempBlock(did);

      const setCall = mockChrome.storage.sync.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.tempBlocks?.[did]).toBeUndefined();
      expect(setCall.tempBlocks?.['did:plc:other']).toBeDefined();
    });

    it('should handle removing non-existent block gracefully', async () => {
      mockSyncStorage['tempBlocks'] = {};

      await expect(removeTempBlock('did:plc:nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('removeTempMute', () => {
    it('should remove a temp mute', async () => {
      const did = 'did:plc:testuser';
      mockSyncStorage['tempMutes'] = {
        [did]: {
          handle: 'testuser.bsky.social',
          expiresAt: Date.now() + 3600000,
          createdAt: Date.now(),
        },
      };

      await removeTempMute(did);

      const setCall = mockChrome.storage.sync.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.tempMutes?.[did]).toBeUndefined();
    });

    it('should handle removing non-existent mute gracefully', async () => {
      mockSyncStorage['tempMutes'] = {};

      await expect(removeTempMute('did:plc:nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('getOptions', () => {
    it('should return default options when none are stored', async () => {
      const options = await getOptions();
      expect(options).toEqual(DEFAULT_OPTIONS);
    });

    it('should return stored options', async () => {
      const customOptions: ExtensionOptions = {
        defaultDuration: 3600000,
        quickBlockDuration: 1800000,
        notificationsEnabled: false,
        notificationSound: true,
        checkInterval: 5,
        showBadgeCount: false,
        theme: 'dark',
      };
      mockLocalStorage['extensionOptions'] = customOptions;

      const options = await getOptions();
      expect(options).toEqual(customOptions);
    });
  });

  describe('setOptions', () => {
    it('should save options to local storage', async () => {
      const options: ExtensionOptions = {
        defaultDuration: 7200000,
        quickBlockDuration: 3600000,
        notificationsEnabled: true,
        notificationSound: false,
        checkInterval: 2,
        showBadgeCount: true,
        theme: 'light',
      };

      await setOptions(options);

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        extensionOptions: options,
      });
    });
  });

  describe('getActionHistory', () => {
    it('should return empty array when no history exists', async () => {
      const history = await getActionHistory();
      expect(history).toEqual([]);
    });

    it('should return stored history', async () => {
      const storedHistory: HistoryEntry[] = [
        {
          id: 'test-id-1',
          did: 'did:plc:user1',
          handle: 'user1.bsky.social',
          action: 'blocked',
          timestamp: Date.now(),
          trigger: 'manual',
          success: true,
        },
      ];
      mockLocalStorage['actionHistory'] = storedHistory;

      const history = await getActionHistory();
      expect(history).toEqual(storedHistory);
    });
  });

  describe('addHistoryEntry', () => {
    it('should add entry to history', async () => {
      const entry: HistoryEntry = {
        did: 'did:plc:user1',
        handle: 'user1.bsky.social',
        action: 'blocked',
        timestamp: Date.now(),
        trigger: 'manual',
        success: true,
      };

      await addHistoryEntry(entry);

      expect(mockChrome.storage.local.set).toHaveBeenCalled();
      const setCall = mockChrome.storage.local.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.actionHistory).toHaveLength(1);
      expect(setCall.actionHistory?.[0].handle).toBe('user1.bsky.social');
    });

    it('should generate ID if not provided', async () => {
      const entry: HistoryEntry = {
        did: 'did:plc:user1',
        handle: 'user1.bsky.social',
        action: 'blocked',
        timestamp: Date.now(),
        trigger: 'manual',
        success: true,
      };

      await addHistoryEntry(entry);

      const setCall = mockChrome.storage.local.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.actionHistory?.[0].id).toBeDefined();
      expect(setCall.actionHistory?.[0].id).toContain('_');
    });

    it('should preserve provided ID', async () => {
      const entry: HistoryEntry = {
        id: 'custom-id-123',
        did: 'did:plc:user1',
        handle: 'user1.bsky.social',
        action: 'blocked',
        timestamp: Date.now(),
        trigger: 'manual',
        success: true,
      };

      await addHistoryEntry(entry);

      const setCall = mockChrome.storage.local.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.actionHistory?.[0].id).toBe('custom-id-123');
    });

    it('should add new entries at the beginning', async () => {
      mockLocalStorage['actionHistory'] = [
        {
          id: 'old-entry',
          did: 'did:plc:old',
          handle: 'old.bsky.social',
          action: 'blocked' as const,
          timestamp: Date.now() - 10000,
          trigger: 'manual' as const,
          success: true,
        },
      ];

      const entry: HistoryEntry = {
        did: 'did:plc:new',
        handle: 'new.bsky.social',
        action: 'blocked',
        timestamp: Date.now(),
        trigger: 'manual',
        success: true,
      };

      await addHistoryEntry(entry);

      const setCall = mockChrome.storage.local.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.actionHistory?.[0].handle).toBe('new.bsky.social');
      expect(setCall.actionHistory?.[1].handle).toBe('old.bsky.social');
    });

    it('should trim history to max 100 entries', async () => {
      // Create 100 existing entries
      const existingEntries: HistoryEntry[] = Array.from({ length: 100 }, (_, i) => ({
        id: `entry-${i}`,
        did: `did:plc:user${i}`,
        handle: `user${i}.bsky.social`,
        action: 'blocked' as const,
        timestamp: Date.now() - i * 1000,
        trigger: 'manual' as const,
        success: true,
      }));
      mockLocalStorage['actionHistory'] = existingEntries;

      const newEntry: HistoryEntry = {
        did: 'did:plc:newest',
        handle: 'newest.bsky.social',
        action: 'blocked',
        timestamp: Date.now(),
        trigger: 'manual',
        success: true,
      };

      await addHistoryEntry(newEntry);

      const setCall = mockChrome.storage.local.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.actionHistory).toHaveLength(100);
      expect(setCall.actionHistory?.[0].handle).toBe('newest.bsky.social');
    });

    it('should handle all action types', async () => {
      const actions: Array<'blocked' | 'unblocked' | 'muted' | 'unmuted'> = [
        'blocked',
        'unblocked',
        'muted',
        'unmuted',
      ];

      for (const action of actions) {
        mockLocalStorage['actionHistory'] = [];
        vi.clearAllMocks();

        const entry: HistoryEntry = {
          did: 'did:plc:user1',
          handle: 'user1.bsky.social',
          action,
          timestamp: Date.now(),
          trigger: 'manual',
          success: true,
        };

        await addHistoryEntry(entry);

        const setCall = mockChrome.storage.local.set.mock.calls[0][0] as StorageSetData;
        expect(setCall.actionHistory?.[0].action).toBe(action);
      }
    });

    it('should handle all trigger types', async () => {
      const triggers: Array<'manual' | 'auto_expire' | 'removed'> = [
        'manual',
        'auto_expire',
        'removed',
      ];

      for (const trigger of triggers) {
        mockLocalStorage['actionHistory'] = [];
        vi.clearAllMocks();

        const entry: HistoryEntry = {
          did: 'did:plc:user1',
          handle: 'user1.bsky.social',
          action: 'blocked',
          timestamp: Date.now(),
          trigger,
          success: true,
        };

        await addHistoryEntry(entry);

        const setCall = mockChrome.storage.local.set.mock.calls[0][0] as StorageSetData;
        expect(setCall.actionHistory?.[0].trigger).toBe(trigger);
      }
    });

    it('should include error message on failed entries', async () => {
      const entry: HistoryEntry = {
        did: 'did:plc:user1',
        handle: 'user1.bsky.social',
        action: 'unblocked',
        timestamp: Date.now(),
        trigger: 'auto_expire',
        success: false,
        error: 'API request failed',
      };

      await addHistoryEntry(entry);

      const setCall = mockChrome.storage.local.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.actionHistory?.[0].success).toBe(false);
      expect(setCall.actionHistory?.[0].error).toBe('API request failed');
    });

    it('should include duration on entries', async () => {
      const entry: HistoryEntry = {
        did: 'did:plc:user1',
        handle: 'user1.bsky.social',
        action: 'unblocked',
        timestamp: Date.now(),
        trigger: 'auto_expire',
        success: true,
        duration: 3600000,
      };

      await addHistoryEntry(entry);

      const setCall = mockChrome.storage.local.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.actionHistory?.[0].duration).toBe(3600000);
    });
  });

  describe('removeAllExpiredBlocks', () => {
    it('should remove expired blocks', async () => {
      const now = Date.now();
      mockSyncStorage['tempBlocks'] = {
        'did:plc:expired': {
          handle: 'expired.bsky.social',
          expiresAt: now - 1000, // Expired
          createdAt: now - 10000,
        },
        'did:plc:active': {
          handle: 'active.bsky.social',
          expiresAt: now + 3600000, // Still active
          createdAt: now - 1000,
        },
      };

      await removeAllExpiredBlocks();

      const setCall = mockChrome.storage.sync.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.tempBlocks?.['did:plc:expired']).toBeUndefined();
      expect(setCall.tempBlocks?.['did:plc:active']).toBeDefined();
    });

    it('should keep all blocks if none are expired', async () => {
      const now = Date.now();
      mockSyncStorage['tempBlocks'] = {
        'did:plc:user1': {
          handle: 'user1.bsky.social',
          expiresAt: now + 3600000,
          createdAt: now,
        },
        'did:plc:user2': {
          handle: 'user2.bsky.social',
          expiresAt: now + 7200000,
          createdAt: now,
        },
      };

      await removeAllExpiredBlocks();

      const setCall = mockChrome.storage.sync.set.mock.calls[0][0] as StorageSetData;
      expect(Object.keys(setCall.tempBlocks || {})).toHaveLength(2);
    });

    it('should remove all blocks if all are expired', async () => {
      const now = Date.now();
      mockSyncStorage['tempBlocks'] = {
        'did:plc:user1': {
          handle: 'user1.bsky.social',
          expiresAt: now - 1000,
          createdAt: now - 10000,
        },
        'did:plc:user2': {
          handle: 'user2.bsky.social',
          expiresAt: now - 500,
          createdAt: now - 5000,
        },
      };

      await removeAllExpiredBlocks();

      const setCall = mockChrome.storage.sync.set.mock.calls[0][0] as StorageSetData;
      expect(Object.keys(setCall.tempBlocks || {})).toHaveLength(0);
    });

    it('should handle empty blocks storage', async () => {
      mockSyncStorage['tempBlocks'] = {};

      await removeAllExpiredBlocks();

      const setCall = mockChrome.storage.sync.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.tempBlocks).toEqual({});
    });
  });

  describe('removeAllExpiredMutes', () => {
    it('should remove expired mutes', async () => {
      const now = Date.now();
      mockSyncStorage['tempMutes'] = {
        'did:plc:expired': {
          handle: 'expired.bsky.social',
          expiresAt: now - 1000, // Expired
          createdAt: now - 10000,
        },
        'did:plc:active': {
          handle: 'active.bsky.social',
          expiresAt: now + 3600000, // Still active
          createdAt: now - 1000,
        },
      };

      await removeAllExpiredMutes();

      const setCall = mockChrome.storage.sync.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.tempMutes?.['did:plc:expired']).toBeUndefined();
      expect(setCall.tempMutes?.['did:plc:active']).toBeDefined();
    });

    it('should keep all mutes if none are expired', async () => {
      const now = Date.now();
      mockSyncStorage['tempMutes'] = {
        'did:plc:user1': {
          handle: 'user1.bsky.social',
          expiresAt: now + 3600000,
          createdAt: now,
        },
      };

      await removeAllExpiredMutes();

      const setCall = mockChrome.storage.sync.set.mock.calls[0][0] as StorageSetData;
      expect(Object.keys(setCall.tempMutes || {})).toHaveLength(1);
    });

    it('should handle empty mutes storage', async () => {
      mockSyncStorage['tempMutes'] = {};

      await removeAllExpiredMutes();

      const setCall = mockChrome.storage.sync.set.mock.calls[0][0] as StorageSetData;
      expect(setCall.tempMutes).toEqual({});
    });
  });
});
