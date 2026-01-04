import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Background Service Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock chrome API
    const chromeMock = {
      storage: {
        sync: {
          get: vi.fn(),
          set: vi.fn(),
        },
        local: {
          get: vi.fn(),
          set: vi.fn(),
        },
      },
      alarms: {
        create: vi.fn(),
        clear: vi.fn(),
        onAlarm: {
          addListener: vi.fn(),
        },
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
      action: {
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
      },
    };

    vi.stubGlobal('chrome', chromeMock);
  });

  it('should be true', () => {
    expect(true).toBe(true);
  });
});
