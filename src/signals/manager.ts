/**
 * Signals for Manager page state management
 */
import { signal, computed } from '@preact/signals';
import type {
  ManagedEntry,
  HistoryEntry,
  PostContext,
  SyncState,
  ExtensionOptions,
  BlocklistAuditState,
  BlocklistConflictGroup,
} from '../types.js';

// Core data signals
export const blocks = signal<ManagedEntry[]>([]);
export const mutes = signal<ManagedEntry[]>([]);
export const history = signal<HistoryEntry[]>([]);
export const contexts = signal<PostContext[]>([]);
export const syncState = signal<SyncState | null>(null);
export const options = signal<ExtensionOptions | null>(null);

// Amnesty state
export const amnestyReviewedDids = signal<Set<string>>(new Set());
export const amnestyCandidate = signal<ManagedEntry | null>(null);
export const amnestySearching = signal(false);
// Track DIDs where we already searched and found no context (avoids repeated searches)
export const amnestySearchedNoContext = signal<Set<string>>(new Set());

// Blocklist audit state
export const blocklistAuditState = signal<BlocklistAuditState | null>(null);
export const blocklistConflicts = signal<BlocklistConflictGroup[]>([]);

// UI state
export type TabType = 'blocks' | 'mutes' | 'history' | 'amnesty' | 'blocklist-audit';
export type SortColumn = 'user' | 'source' | 'status' | 'expires' | 'date';
export type SortDirection = 'asc' | 'desc';

export const currentTab = signal<TabType>('blocks');
export const searchQuery = signal('');
export const filterSource = signal('all');
export const sortColumn = signal<SortColumn>('date');
export const sortDirection = signal<SortDirection>('desc');
export const selectedItems = signal<Set<string>>(new Set());
export const loading = signal(true);

// Temp unblock tracking
export const tempUnblockTimers = signal<Map<string, { timerId: number; expiresAt: number }>>(new Map());

// Context map computed from contexts
export const contextMap = computed(() => {
  const map = new Map<string, PostContext>();
  for (const ctx of contexts.value) {
    const existing = map.get(ctx.targetDid);
    if (!existing || ctx.timestamp > existing.timestamp) {
      map.set(ctx.targetDid, ctx);
    }
  }
  return map;
});

// Computed stats
export const stats = computed(() => ({
  totalBlocks: blocks.value.length,
  totalMutes: mutes.value.length,
  tempBlocks: blocks.value.filter((b) => b.source === 'ergoblock_temp').length,
  tempMutes: mutes.value.filter((m) => m.source === 'ergoblock_temp').length,
}));

// Sorting toggle helper
export function toggleSort(column: SortColumn): void {
  if (sortColumn.value === column) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn.value = column;
    sortDirection.value = column === 'date' || column === 'expires' ? 'desc' : 'asc';
  }
}

// Selection helpers
export function toggleSelection(did: string): void {
  const newSet = new Set(selectedItems.value);
  if (newSet.has(did)) {
    newSet.delete(did);
  } else {
    newSet.add(did);
  }
  selectedItems.value = newSet;
}

export function selectAll(dids: string[]): void {
  selectedItems.value = new Set(dids);
}

export function clearSelection(): void {
  selectedItems.value = new Set();
}
