// Popup script for ErgoBlock - Simplified view with manager link

import browser from './browser.js';
import {
  STORAGE_KEYS,
  getTempBlocks,
  getTempMutes,
  getPermanentBlocks,
  getPermanentMutes,
  getActionHistory,
  getSyncState,
} from './storage.js';
import type { HistoryEntry } from './types.js';

interface TempItem {
  handle: string;
  expiresAt: number;
  createdAt: number;
}

interface CombinedItem {
  did: string;
  handle: string;
  expiresAt: number;
  createdAt: number;
  type: 'block' | 'mute';
}

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

/**
 * Format remaining time
 */
function formatTimeRemaining(expiresAt: number): string {
  const now = Date.now();
  const remaining = expiresAt - now;

  if (remaining <= 0) {
    return 'Expired';
  }

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Format a timestamp as relative time
 */
function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/**
 * Create an item element for expiring soon list
 */
function createExpiringItem(item: CombinedItem): HTMLElement {
  const el = document.createElement('div');
  el.className = 'item';

  const info = document.createElement('div');
  info.className = 'item-info';

  const handleDiv = document.createElement('div');
  handleDiv.className = 'item-handle';
  handleDiv.textContent = `@${item.handle}`;

  const metaDiv = document.createElement('div');
  metaDiv.className = 'item-meta';

  const typeSpan = document.createElement('span');
  typeSpan.className = `item-type ${item.type}`;
  typeSpan.textContent = item.type;

  const timeSpan = document.createElement('span');
  timeSpan.textContent = formatTimeRemaining(item.expiresAt);

  metaDiv.appendChild(typeSpan);
  metaDiv.appendChild(timeSpan);

  info.appendChild(handleDiv);
  info.appendChild(metaDiv);

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const btn = document.createElement('button');
  btn.className = 'btn btn-remove';
  btn.dataset.did = item.did;
  btn.dataset.type = item.type;
  btn.textContent = 'Remove';

  actions.appendChild(btn);

  el.appendChild(info);
  el.appendChild(actions);

  return el;
}

/**
 * Create an item element for recent activity list
 */
function createRecentItem(entry: HistoryEntry): HTMLElement {
  const el = document.createElement('div');
  el.className = 'item';

  const info = document.createElement('div');
  info.className = 'item-info';

  const handleDiv = document.createElement('div');
  handleDiv.className = 'item-handle';
  handleDiv.textContent = `@${entry.handle}`;

  const metaDiv = document.createElement('div');
  metaDiv.className = 'item-meta';

  const actionType = entry.action.includes('block') ? 'block' : 'mute';
  const typeSpan = document.createElement('span');
  typeSpan.className = `item-type ${actionType}`;
  typeSpan.textContent = entry.action;

  const timeSpan = document.createElement('span');
  timeSpan.textContent = formatTimestamp(entry.timestamp);

  metaDiv.appendChild(typeSpan);
  metaDiv.appendChild(timeSpan);

  info.appendChild(handleDiv);
  info.appendChild(metaDiv);

  el.appendChild(info);

  return el;
}

/**
 * Load and render stats
 */
async function renderStats(): Promise<void> {
  const [tempBlocks, tempMutes, permBlocks, permMutes] = await Promise.all([
    getTempBlocks(),
    getTempMutes(),
    getPermanentBlocks(),
    getPermanentMutes(),
  ]);

  // Total counts = temp + permanent (permanent excludes temp)
  const blockCount = Object.keys(tempBlocks).length + Object.keys(permBlocks).length;
  const muteCount = Object.keys(tempMutes).length + Object.keys(permMutes).length;

  // Count expiring in 24h (only temp blocks/mutes have expiration)
  const now = Date.now();
  let expiringCount = 0;

  for (const data of Object.values(tempBlocks)) {
    if (data.expiresAt - now <= TWENTY_FOUR_HOURS && data.expiresAt > now) {
      expiringCount++;
    }
  }
  for (const data of Object.values(tempMutes)) {
    if (data.expiresAt - now <= TWENTY_FOUR_HOURS && data.expiresAt > now) {
      expiringCount++;
    }
  }

  const statBlocks = document.getElementById('stat-blocks');
  const statMutes = document.getElementById('stat-mutes');
  const statExpiring = document.getElementById('stat-expiring');

  if (statBlocks) statBlocks.textContent = String(blockCount);
  if (statMutes) statMutes.textContent = String(muteCount);
  if (statExpiring) statExpiring.textContent = String(expiringCount);
}

/**
 * Render expiring soon list (next 5 items expiring within 24h)
 */
async function renderExpiringSoon(): Promise<void> {
  const list = document.getElementById('expiring-list');
  if (!list) return;

  const [blocks, mutes] = await Promise.all([getTempBlocks(), getTempMutes()]);

  const now = Date.now();
  const combined: CombinedItem[] = [];

  // Collect blocks expiring within 24h
  for (const [did, data] of Object.entries(blocks)) {
    const item = data as TempItem;
    if (item.expiresAt - now <= TWENTY_FOUR_HOURS && item.expiresAt > now) {
      combined.push({
        did,
        handle: item.handle,
        expiresAt: item.expiresAt,
        createdAt: item.createdAt,
        type: 'block',
      });
    }
  }

  // Collect mutes expiring within 24h
  for (const [did, data] of Object.entries(mutes)) {
    const item = data as TempItem;
    if (item.expiresAt - now <= TWENTY_FOUR_HOURS && item.expiresAt > now) {
      combined.push({
        did,
        handle: item.handle,
        expiresAt: item.expiresAt,
        createdAt: item.createdAt,
        type: 'mute',
      });
    }
  }

  // Sort by expiration (soonest first)
  combined.sort((a, b) => a.expiresAt - b.expiresAt);

  // Take first 5
  const items = combined.slice(0, 5);

  if (items.length === 0) {
    list.innerHTML = '<div class="empty">Nothing expiring soon</div>';
    return;
  }

  list.innerHTML = '';
  for (const item of items) {
    list.appendChild(createExpiringItem(item));
  }
}

/**
 * Render recent activity list (last 5 history entries)
 */
async function renderRecentActivity(): Promise<void> {
  const list = document.getElementById('recent-list');
  if (!list) return;

  const history = await getActionHistory();
  const recent = history.slice(0, 5);

  if (recent.length === 0) {
    list.innerHTML = '<div class="empty">No recent activity</div>';
    return;
  }

  list.innerHTML = '';
  for (const entry of recent) {
    list.appendChild(createRecentItem(entry));
  }
}

/**
 * Update sync status display
 */
async function updateSyncStatus(): Promise<void> {
  const syncStatus = document.getElementById('sync-status');
  if (!syncStatus) return;

  const state = await getSyncState();

  if (state.lastBlockSync > 0 || state.lastMuteSync > 0) {
    const lastSync = Math.max(state.lastBlockSync, state.lastMuteSync);
    syncStatus.textContent = `Last sync: ${formatTimestamp(lastSync)}`;
    syncStatus.style.display = 'block';
  } else {
    syncStatus.style.display = 'none';
  }
}

/**
 * Remove a temp block or mute
 */
async function removeItem(did: string, type: string): Promise<void> {
  updateStatus(type === 'block' ? 'Unblocking...' : 'Unmuting...');

  try {
    const response = (await browser.runtime.sendMessage({
      type: type === 'block' ? 'UNBLOCK_USER' : 'UNMUTE_USER',
      did,
    })) as { success: boolean; error?: string };

    if (!response.success) {
      throw new Error(response.error || 'Failed to process request');
    }

    // Remove from storage
    const key = type === 'block' ? STORAGE_KEYS.TEMP_BLOCKS : STORAGE_KEYS.TEMP_MUTES;
    const result = await browser.storage.sync.get(key);
    const items = (result[key] || {}) as Record<string, TempItem>;

    delete items[did];
    await browser.storage.sync.set({ [key]: items });

    // Re-render
    renderStats();
    renderExpiringSoon();
    updateStatus(type === 'block' ? 'Unblocked!' : 'Unmuted!');
  } catch (error) {
    console.error('[ErgoBlock Popup] Remove failed:', error);
    updateStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update status message
 */
function updateStatus(message: string): void {
  const status = document.getElementById('status');
  if (!status) return;

  status.textContent = message;
  setTimeout(() => {
    status.textContent = '';
  }, 3000);
}

/**
 * Check and display auth status
 */
async function checkAuthStatus(): Promise<void> {
  const warning = document.getElementById('auth-warning');
  if (!warning) return;

  const result = await browser.storage.local.get('authStatus');
  const status = result.authStatus || 'unknown';

  if (status === 'invalid') {
    warning.style.display = 'block';
  } else {
    warning.style.display = 'none';
  }
}

/**
 * Check expirations now
 */
async function checkNow(): Promise<void> {
  updateStatus('Checking expirations...');

  try {
    const response = (await browser.runtime.sendMessage({ type: 'CHECK_NOW' })) as {
      success: boolean;
    };
    if (response.success) {
      updateStatus('Check complete!');
    }

    renderStats();
    renderExpiringSoon();
    renderRecentActivity();
    checkAuthStatus();
  } catch (error) {
    const result = await browser.storage.local.get('authStatus');
    if (result.authStatus === 'invalid') {
      updateStatus('Error: Session expired');
    } else {
      updateStatus('Error: ' + (error instanceof Error ? error.message : String(error)));
    }
    checkAuthStatus();
  }
}

/**
 * Trigger sync with Bluesky
 */
async function syncNow(): Promise<void> {
  updateStatus('Syncing with Bluesky...');

  try {
    const response = (await browser.runtime.sendMessage({ type: 'SYNC_NOW' })) as {
      success: boolean;
      error?: string;
    };

    if (response.success) {
      updateStatus('Sync complete!');
      updateSyncStatus();
    } else {
      throw new Error(response.error || 'Sync failed');
    }

    renderStats();
    renderExpiringSoon();
    renderRecentActivity();
  } catch (error) {
    console.error('[ErgoBlock Popup] Sync failed:', error);
    updateStatus(`Sync error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Open the full manager page
 */
function openManager(): void {
  browser.tabs.create({ url: browser.runtime.getURL('manager.html') });
}

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
  renderStats();
  renderExpiringSoon();
  renderRecentActivity();
  checkAuthStatus();
  updateSyncStatus();

  // Open manager button
  const openManagerBtn = document.getElementById('open-manager');
  if (openManagerBtn) {
    openManagerBtn.addEventListener('click', openManager);
  }

  // Check now button
  const checkNowBtn = document.getElementById('check-now');
  if (checkNowBtn) {
    checkNowBtn.addEventListener('click', checkNow);
  }

  // Sync now button
  const syncNowBtn = document.getElementById('sync-now');
  if (syncNowBtn) {
    syncNowBtn.addEventListener('click', syncNow);
  }

  // Remove buttons (delegated)
  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('btn-remove')) {
      const did = target.dataset.did;
      const type = target.dataset.type;
      if (did && type) {
        removeItem(did, type);
      }
    }
  });
});

// Refresh lists periodically while popup is open
setInterval(() => {
  renderStats();
  renderExpiringSoon();
}, 30000); // Every 30 seconds
