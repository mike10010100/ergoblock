import { describe, it, expect } from 'vitest';
import { DEFAULT_OPTIONS } from '../types';

describe('types', () => {
  it('should have default options configured', () => {
    expect(DEFAULT_OPTIONS.defaultDuration).toBe(86400000);
    expect(DEFAULT_OPTIONS.quickBlockDuration).toBe(3600000);
    expect(DEFAULT_OPTIONS.notificationsEnabled).toBe(true);
    expect(DEFAULT_OPTIONS.notificationSound).toBe(false);
    expect(DEFAULT_OPTIONS.checkInterval).toBe(1);
    expect(DEFAULT_OPTIONS.showBadgeCount).toBe(true);
    expect(DEFAULT_OPTIONS.theme).toBe('auto');
  });
});
