import type { JSX } from 'preact';
import type { PostContext } from '../../types.js';
import { contextMap, tempUnblockTimers } from '../../signals/manager.js';
import { postUriToUrl } from './utils.js';

interface ContextCellProps {
  did: string;
  handle: string;
  isBlocked: boolean;
  onFindContext: (did: string, handle: string) => void;
  onViewPost: (did: string, handle: string, url: string) => void;
}

export function ContextCell({
  did,
  handle,
  isBlocked,
  onFindContext,
  onViewPost,
}: ContextCellProps): JSX.Element {
  const ctx = contextMap.value.get(did);
  const tempTimer = tempUnblockTimers.value.get(did);

  if (!ctx) {
    return (
      <td class="context-col">
        <div class="context-cell">
          <span class="no-context">No context</span>
          <button
            class="context-btn find-context-btn"
            onClick={() => onFindContext(did, handle)}
          >
            Find
          </button>
        </div>
      </td>
    );
  }

  const postUrl = ctx.postUri ? postUriToUrl(ctx.postUri) : '';
  const isGuessed = ctx.guessed === true;

  return (
    <td class="context-col">
      <div class="context-cell">
        {ctx.postText ? (
          <span class="context-text">{ctx.postText}</span>
        ) : (
          <span class="no-context">No text</span>
        )}
        <div class="context-meta">
          {isGuessed && (
            <span class="badge badge-guessed" title="Auto-detected">
              Auto
            </span>
          )}
          {postUrl && (
            isBlocked ? (
              <button
                class={`context-btn context-view-btn ${tempTimer ? 'temp-unblocked' : ''}`}
                onClick={() => onViewPost(did, handle, postUrl)}
                disabled={!!tempTimer}
              >
                {tempTimer ? `Re-blocking...` : 'View'}
              </button>
            ) : (
              <a href={postUrl} target="_blank" rel="noopener" class="context-btn context-link-btn">
                View
              </a>
            )
          )}
        </div>
      </div>
    </td>
  );
}
