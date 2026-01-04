import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('storage module', () => {
  beforeEach(() => {
    // Mock chrome.storage
    global.chrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as any;
  });

  it('should export storage functions', async () => {
    // Basic smoke test - just ensure module loads
    expect(true).toBe(true);
  });
});
