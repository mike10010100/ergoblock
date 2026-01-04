import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addTempBlock } from '../storage.js';

describe('Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock chrome API
    const chromeMock = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({ tempBlocks: {} }),
          set: vi.fn(),
        },
        local: {
          get: vi.fn(),
          set: vi.fn(),
        },
      },
      runtime: {
        sendMessage: vi.fn(),
      },
    };

    vi.stubGlobal('chrome', chromeMock);
  });

  it('should add a temp block', async () => {
    await addTempBlock('did:test:123', 'test.bsky.social');

    expect(chrome.storage.sync.set).toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TEMP_BLOCK_ADDED',
        did: 'did:test:123',
      })
    );
  });
});
