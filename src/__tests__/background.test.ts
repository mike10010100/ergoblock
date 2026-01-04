import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('background service worker', () => {
  beforeEach(() => {
    // Mock chrome APIs
    global.chrome = {
      action: {
        setBadgeText: vi.fn().mockResolvedValue(undefined),
        setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
        sync: {
          get: vi.fn().mockResolvedValue({}),
        },
      },
      alarms: {
        create: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
        onAlarm: {
          addListener: vi.fn(),
        },
      },
      notifications: {
        create: vi.fn().mockResolvedValue(undefined),
      },
      runtime: {
        onMessage: {
          addListener: vi.fn(),
        },
        onInstalled: {
          addListener: vi.fn(),
        },
        onStartup: {
          addListener: vi.fn(),
        },
      },
    } as any;
  });

  it('should initialize background service worker', () => {
    expect(global.chrome).toBeDefined();
    expect(global.chrome.action).toBeDefined();
    expect(global.chrome.storage).toBeDefined();
  });
});
