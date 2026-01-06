/**
 * Screenshot capture utility for ErgoBlock
 * Uses chrome.tabs.captureVisibleTab via background script for reliable capture
 */

import type { ScreenshotData } from './types.js';
import { addScreenshot, getOptions } from './storage.js';

// Selectors for finding post containers
const POST_SELECTORS = [
  '[data-testid*="feedItem"]',
  '[data-testid*="postThreadItem"]',
  'article',
  '[data-testid*="post"]',
];

/**
 * Find the post container element from a clicked element
 */
export function findPostContainer(element: HTMLElement | null): HTMLElement | null {
  if (!element) return null;

  for (const selector of POST_SELECTORS) {
    const container = element.closest(selector);
    if (container) return container as HTMLElement;
  }

  return null;
}

/**
 * Extract post text from a post container
 */
function extractPostText(postContainer: HTMLElement): string | undefined {
  // Try various selectors for post text
  const textSelectors = [
    '[data-testid*="postText"]',
    '[data-testid="postContent"]',
    '.post-text',
    'p',
  ];

  for (const selector of textSelectors) {
    const el = postContainer.querySelector(selector);
    if (el?.textContent?.trim()) {
      return el.textContent.trim().slice(0, 500); // Limit to 500 chars
    }
  }

  return undefined;
}

/**
 * Extract post URL from a post container
 */
function extractPostUrl(postContainer: HTMLElement): string | undefined {
  // Look for a link to the post itself
  const postLink = postContainer.querySelector('a[href*="/post/"]') as HTMLAnchorElement | null;
  return postLink?.href;
}

/**
 * Generate a unique screenshot ID
 */
function generateScreenshotId(): string {
  return `ss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Request screenshot capture from background script
 */
async function requestScreenshotFromBackground(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[ErgoBlock] Screenshot request failed:', chrome.runtime.lastError);
        resolve(null);
        return;
      }
      if (response?.success && response.imageData) {
        resolve(response.imageData);
      } else {
        console.warn('[ErgoBlock] Screenshot capture failed:', response?.error);
        resolve(null);
      }
    });
  });
}

/**
 * Capture a screenshot of the visible tab when blocking/muting from a post
 */
export async function capturePostScreenshot(
  postContainer: HTMLElement,
  handle: string,
  did: string,
  actionType: 'block' | 'mute',
  permanent: boolean
): Promise<ScreenshotData | null> {
  const options = await getOptions();

  if (!options.screenshotEnabled) {
    console.log('[ErgoBlock] Screenshot capture disabled');
    return null;
  }

  try {
    console.log('[ErgoBlock] Requesting screenshot capture...');

    // Request screenshot from background script
    const imageData = await requestScreenshotFromBackground();

    if (!imageData) {
      console.warn('[ErgoBlock] No screenshot data received');
      return null;
    }

    // Extract metadata from the post
    const postText = extractPostText(postContainer);
    const postUrl = extractPostUrl(postContainer);

    const screenshot: ScreenshotData = {
      id: generateScreenshotId(),
      imageData,
      handle,
      did,
      actionType,
      permanent,
      timestamp: Date.now(),
      postText,
      postUrl,
    };

    // Store the screenshot
    await addScreenshot(screenshot);

    console.log('[ErgoBlock] Screenshot captured and stored:', screenshot.id);
    return screenshot;
  } catch (error) {
    console.error('[ErgoBlock] Screenshot capture failed:', error);
    return null;
  }
}
