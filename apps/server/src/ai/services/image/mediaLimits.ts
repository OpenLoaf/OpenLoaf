/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/** Max raw file size for video attachments to be sent natively. */
export const VIDEO_SIZE_LIMIT_BYTES = 20 * 1024 * 1024

/** Max raw file size for audio attachments to be sent natively. */
export const AUDIO_SIZE_LIMIT_BYTES = 10 * 1024 * 1024

/**
 * CDN URL freshness window. SaaS `uploadFile` signs URLs for 24h; leave a 1h
 * safety margin before considering a cached URL stale.
 */
export const CDN_URL_TTL_MS = 23 * 60 * 60 * 1000
