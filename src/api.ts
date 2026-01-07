import {
  BskySession,
  BskyAccount,
  StorageStructure,
  Profile,
  ProfileView,
  ProfileWithViewer,
  GetBlocksResponse,
  GetMutesResponse,
  BlockRecord,
  ListBlockRecordsResponse,
  FeedPost,
  GetAuthorFeedResponse,
} from './types.js';

// AT Protocol API helpers for Bluesky
// Handles block/mute/unblock/unmute operations

// Public Bluesky API endpoint (AppView) - use this for most operations
const BSKY_PUBLIC_API = 'https://public.api.bsky.app';
// User's PDS for repo operations
const BSKY_PDS_DEFAULT = 'https://bsky.social';

// Helper to safely access localStorage
const getLocalStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
};

/**
 * Get the current session from Bluesky's localStorage
 * @returns {Object|null} Session object with accessJwt and did
 */
export function getSession(): BskySession | null {
  try {
    const localStorageProxy = getLocalStorage();
    if (!localStorageProxy) return null;

    // Try multiple possible storage key patterns
    const possibleKeys = Object.keys(localStorageProxy).filter(
      (k) => k.includes('BSKY') || k.includes('bsky') || k.includes('session')
    );

    console.log('[TempBlock] Found storage keys:', possibleKeys);

    for (const storageKey of possibleKeys) {
      try {
        const raw = localStorageProxy.getItem(storageKey);
        if (!raw) continue;

        const parsed = JSON.parse(raw) as StorageStructure;
        console.log('[TempBlock] Checking storage key:', storageKey);

        // Try different possible structures
        let account: BskyAccount | null = null;

        // Structure 1: { session: { currentAccount: {...}, accounts: [...] } }
        if (parsed?.session?.currentAccount) {
          const currentDid = parsed.session.currentAccount.did;
          account = parsed.session.accounts?.find((a) => a.did === currentDid) || null;
        }

        // Structure 2: { currentAccount: {...}, accounts: [...] }
        if (!account && parsed?.currentAccount) {
          const currentDid = parsed.currentAccount.did;
          account = parsed.accounts?.find((a) => a.did === currentDid) || null;
        }

        // Structure 3: Direct account object
        if (!account && parsed?.accessJwt && parsed?.did) {
          account = parsed as unknown as BskyAccount;
        }

        if (account && account.accessJwt && account.did) {
          console.log('[TempBlock] Found session for:', account.handle || account.did);
          // Normalize the PDS URL
          let pdsUrl = account.pdsUrl || account.service || BSKY_PDS_DEFAULT;
          // Remove trailing slashes
          pdsUrl = pdsUrl.replace(/\/+$/, '');
          // Ensure https:// prefix
          if (!pdsUrl.startsWith('http://') && !pdsUrl.startsWith('https://')) {
            pdsUrl = 'https://' + pdsUrl;
          }
          console.log('[TempBlock] Using PDS URL:', pdsUrl);

          return {
            accessJwt: account.accessJwt,
            refreshJwt: account.refreshJwt,
            did: account.did,
            handle: account.handle || '',
            pdsUrl,
          };
        }
      } catch (_e) {
        // Continue to next key
      }
    }

    console.error('[TempBlock] No valid session found in localStorage');
    return null;
  } catch (e) {
    console.error('[TempBlock] Failed to get session:', e);
    return null;
  }
}

/**
 * Execute an authenticated API request
 * Shared logic for both content script (localStorage) and background (chrome.storage)
 */
export async function executeApiRequest<T>(
  endpoint: string,
  method: string,
  body: unknown,
  auth: { accessJwt: string; pdsUrl: string },
  targetBaseUrl?: string
): Promise<T | null> {
  // Determine correct base URL:
  // - com.atproto.repo.* endpoints go to user's PDS
  // - app.bsky.* endpoints go to public API (AppView) unless overridden
  let base = targetBaseUrl;

  if (!base) {
    if (endpoint.startsWith('com.atproto.repo.')) {
      base = auth.pdsUrl;
    } else {
      base = BSKY_PUBLIC_API;
    }
  }

  if (!base) {
    throw new Error('Could not determine base URL for API request');
  }

  // Normalize base URL - remove trailing slashes
  base = base.replace(/\/+$/, '');

  const url = `${base}/xrpc/${endpoint}`;
  console.log('[TempBlock] API request:', method, url);

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${auth.accessJwt}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
    const errorCode = error.error || '';
    const errorMessage = error.message || error.error || `API error: ${response.status}`;

    // Block-related errors are expected during context detection, don't log as errors
    const isBlockError =
      errorCode === 'BlockedActor' ||
      errorCode === 'BlockedByActor' ||
      errorMessage.includes('blocked');

    if (!isBlockError) {
      console.error('[TempBlock] API error:', response.status, JSON.stringify(error));
    }

    // Throw specific error for 401 to help background worker detect auth failure
    if (response.status === 401) {
      throw new Error(`Auth error: ${response.status} ${errorMessage}`);
    }

    throw new Error(errorMessage);
  }

  // Some endpoints return empty responses
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : null;
}

/**
 * Make an authenticated API request (using local session)
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {Object} body - Request body
 * @param {string} baseUrl - Override base URL (for PDS vs AppView)
 */
async function apiRequest<T>(
  endpoint: string,
  method = 'GET',
  body: unknown = null,
  baseUrl: string | null = null
): Promise<T | null> {
  const session = getSession();
  if (!session) {
    throw new Error('Not logged in to Bluesky');
  }

  return executeApiRequest<T>(
    endpoint,
    method,
    body,
    { accessJwt: session.accessJwt, pdsUrl: session.pdsUrl },
    baseUrl || undefined
  );
}

/**
 * Block a user
 * @param {string} did - DID of user to block
 * @returns {Promise<{ uri: string; cid: string } | null>} The created record info
 */
export async function blockUser(did: string): Promise<{ uri: string; cid: string } | null> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  const record = {
    $type: 'app.bsky.graph.block',
    subject: did,
    createdAt: new Date().toISOString(),
  };

  return apiRequest<{ uri: string; cid: string }>('com.atproto.repo.createRecord', 'POST', {
    repo: session.did,
    collection: 'app.bsky.graph.block',
    record,
  });
}

/**
 * Unblock a user
 * @param {string} did - DID of user to unblock
 * @param {string} [rkey] - Optional record key for direct deletion
 */
export async function unblockUser(did: string, rkey?: string): Promise<unknown> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  // If we have the rkey, delete directly (O(1))
  if (rkey) {
    console.log('[TempBlock] Unblocking using direct rkey:', rkey);
    return apiRequest('com.atproto.repo.deleteRecord', 'POST', {
      repo: session.did,
      collection: 'app.bsky.graph.block',
      rkey,
    });
  }

  // Fallback: find the block record (legacy method, O(N))
  console.log('[TempBlock] Unblocking using list scan (legacy)...');
  const blocks = await apiRequest<{ records?: Array<{ value: { subject: string }; uri: string }> }>(
    `com.atproto.repo.listRecords?repo=${session.did}&collection=app.bsky.graph.block&limit=100`
  );

  const blockRecord = blocks?.records?.find((r) => r.value.subject === did);
  if (!blockRecord) {
    console.log('[TempBlock] No block record found for', did);
    return null;
  }

  // Delete the block record
  const foundRkey = blockRecord.uri.split('/').pop();
  if (!foundRkey) {
    console.log('[TempBlock] Block record URI missing rkey for', did, 'URI:', blockRecord.uri);
    return null;
  }

  return apiRequest('com.atproto.repo.deleteRecord', 'POST', {
    repo: session.did,
    collection: 'app.bsky.graph.block',
    rkey: foundRkey,
  });
}

/**
 * Mute a user
 * @param {string} did - DID of user to mute
 */
export async function muteUser(did: string): Promise<unknown> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');
  // Mute goes to user's PDS
  return apiRequest(
    'app.bsky.graph.muteActor',
    'POST',
    {
      actor: did,
    },
    session.pdsUrl
  );
}

/**
 * Unmute a user
 * @param {string} did - DID of user to unmute
 */
export async function unmuteUser(did: string): Promise<unknown> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');
  // Unmute goes to user's PDS
  return apiRequest(
    'app.bsky.graph.unmuteActor',
    'POST',
    {
      actor: did,
    },
    session.pdsUrl
  );
}

/**
 * Get a user's profile by handle or DID
 * @param {string} actor - Handle or DID
 */
export async function getProfile(actor: string): Promise<Profile | null> {
  return apiRequest<Profile>(`app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`);
}

/**
 * Response from app.bsky.actor.getProfiles
 */
interface GetProfilesResponse {
  profiles: ProfileWithViewer[];
}

/**
 * Get multiple profiles with viewer state (up to 25 at a time)
 * Includes relationship info: blocking, muted, following, followedBy
 * @param actors - Array of handles or DIDs (max 25)
 */
export async function getProfiles(actors: string[]): Promise<ProfileWithViewer[]> {
  if (actors.length === 0) return [];
  if (actors.length > 25) {
    throw new Error('getProfiles supports max 25 actors at once');
  }

  const params = actors.map((a) => `actors=${encodeURIComponent(a)}`).join('&');
  const response = await apiRequest<GetProfilesResponse>(`app.bsky.actor.getProfiles?${params}`);
  return response?.profiles || [];
}

/**
 * Get profiles for a list of DIDs, batching requests (25 per batch)
 * Returns a Map of DID -> ProfileWithViewer for quick lookup
 */
export async function getProfilesBatched(
  dids: string[],
  onProgress?: (fetched: number, total: number) => void
): Promise<Map<string, ProfileWithViewer>> {
  const result = new Map<string, ProfileWithViewer>();
  const batchSize = 25;

  for (let i = 0; i < dids.length; i += batchSize) {
    const batch = dids.slice(i, i + batchSize);
    const profiles = await getProfiles(batch);

    for (const profile of profiles) {
      result.set(profile.did, profile);
    }

    onProgress?.(Math.min(i + batchSize, dids.length), dids.length);

    // Rate limit between batches
    if (i + batchSize < dids.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return result;
}

// Rate limiting delay for paginated requests (ms)
const PAGINATION_DELAY = 500;

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get a page of blocked users
 * @param cursor - Pagination cursor
 * @param limit - Number of results per page (max 100)
 */
export async function getBlocks(cursor?: string, limit = 100): Promise<GetBlocksResponse> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  let endpoint = `app.bsky.graph.getBlocks?limit=${limit}`;
  if (cursor) {
    endpoint += `&cursor=${encodeURIComponent(cursor)}`;
  }

  // getBlocks goes to user's PDS
  const response = await apiRequest<GetBlocksResponse>(endpoint, 'GET', null, session.pdsUrl);
  return response || { blocks: [] };
}

/**
 * Get a page of muted users
 * @param cursor - Pagination cursor
 * @param limit - Number of results per page (max 100)
 */
export async function getMutes(cursor?: string, limit = 100): Promise<GetMutesResponse> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  let endpoint = `app.bsky.graph.getMutes?limit=${limit}`;
  if (cursor) {
    endpoint += `&cursor=${encodeURIComponent(cursor)}`;
  }

  // getMutes goes to user's PDS
  const response = await apiRequest<GetMutesResponse>(endpoint, 'GET', null, session.pdsUrl);
  return response || { mutes: [] };
}

/**
 * Fetch all blocked users (paginated)
 * @param onProgress - Optional callback with current count
 */
export async function getAllBlocks(
  onProgress?: (count: number) => void
): Promise<ProfileView[]> {
  const allBlocks: ProfileView[] = [];
  let cursor: string | undefined;

  do {
    const response = await getBlocks(cursor);
    allBlocks.push(...response.blocks);
    cursor = response.cursor;
    onProgress?.(allBlocks.length);

    // Rate limit between requests
    if (cursor) {
      await sleep(PAGINATION_DELAY);
    }
  } while (cursor);

  console.log('[ErgoBlock] Fetched all blocks:', allBlocks.length);
  return allBlocks;
}

/**
 * Fetch all muted users (paginated)
 * @param onProgress - Optional callback with current count
 */
export async function getAllMutes(
  onProgress?: (count: number) => void
): Promise<ProfileView[]> {
  const allMutes: ProfileView[] = [];
  let cursor: string | undefined;

  do {
    const response = await getMutes(cursor);
    allMutes.push(...response.mutes);
    cursor = response.cursor;
    onProgress?.(allMutes.length);

    // Rate limit between requests
    if (cursor) {
      await sleep(PAGINATION_DELAY);
    }
  } while (cursor);

  console.log('[ErgoBlock] Fetched all mutes:', allMutes.length);
  return allMutes;
}

/**
 * Get a page of block records with createdAt timestamps
 * @param cursor - Pagination cursor
 * @param limit - Number of results per page (max 100)
 */
export async function getBlockRecords(
  cursor?: string,
  limit = 100
): Promise<ListBlockRecordsResponse> {
  const session = getSession();
  if (!session) throw new Error('Not logged in');

  let endpoint = `com.atproto.repo.listRecords?repo=${session.did}&collection=app.bsky.graph.block&limit=${limit}`;
  if (cursor) {
    endpoint += `&cursor=${encodeURIComponent(cursor)}`;
  }

  // listRecords goes to user's PDS
  const response = await apiRequest<ListBlockRecordsResponse>(
    endpoint,
    'GET',
    null,
    session.pdsUrl
  );
  return response || { records: [] };
}

/**
 * Fetch all block records with createdAt timestamps (paginated)
 * @param onProgress - Optional callback with current count
 */
export async function getAllBlockRecords(
  onProgress?: (count: number) => void
): Promise<BlockRecord[]> {
  const allRecords: BlockRecord[] = [];
  let cursor: string | undefined;

  do {
    const response = await getBlockRecords(cursor);
    allRecords.push(...response.records);
    cursor = response.cursor;
    onProgress?.(allRecords.length);

    // Rate limit between requests
    if (cursor) {
      await sleep(PAGINATION_DELAY);
    }
  } while (cursor);

  console.log('[ErgoBlock] Fetched all block records:', allRecords.length);
  return allRecords;
}

/**
 * Get a user's feed (posts, replies, reposts)
 * @param actor - DID or handle
 * @param limit - Number of posts to fetch
 * @param cursor - Pagination cursor
 */
export async function getAuthorFeed(
  actor: string,
  limit = 100,
  cursor?: string
): Promise<GetAuthorFeedResponse> {
  let endpoint = `app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(actor)}&limit=${limit}`;
  if (cursor) {
    endpoint += `&cursor=${encodeURIComponent(cursor)}`;
  }

  // getAuthorFeed goes to public API
  const response = await apiRequest<GetAuthorFeedResponse>(endpoint);
  return response || { feed: [] };
}

/**
 * Find the most recent interaction (reply or quote) from targetDid to loggedInDid
 * Used for "guessed context" when importing blocks
 * @param targetDid - DID of the blocked user
 * @param loggedInDid - DID of the logged-in user
 * @param limit - Number of posts to scan (default 100)
 */
export async function findRecentInteraction(
  targetDid: string,
  loggedInDid: string,
  limit = 100
): Promise<FeedPost | null> {
  try {
    const { feed } = await getAuthorFeed(targetDid, limit);

    for (const { post } of feed) {
      // Check if this is a reply to the logged-in user
      if (post.record.reply?.parent?.uri?.includes(loggedInDid)) {
        return post;
      }

      // Check if this is a quote of the logged-in user's post
      if (
        post.record.embed?.$type === 'app.bsky.embed.record' &&
        post.record.embed.record?.uri?.includes(loggedInDid)
      ) {
        return post;
      }
    }

    return null;
  } catch (error) {
    // User may have blocked us back, profile may be private, etc.
    console.debug(
      `[ErgoBlock] Could not fetch feed for ${targetDid}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
