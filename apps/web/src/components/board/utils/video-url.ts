/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/** Patterns for known video platforms — matched synchronously for instant feedback. */
const VIDEO_PLATFORM_PATTERNS = [
  // YouTube
  /(?:youtube\.com\/(?:watch|embed|shorts|live|playlist|channel|@)|youtu\.be\/)/i,
  // Bilibili
  /bilibili\.com\/video\//i,
  /b23\.tv\//i,
  // Vimeo
  /vimeo\.com\//i,
  // TikTok / Douyin
  /tiktok\.com\//i,
  /douyin\.com\//i,
  // Twitter / X
  /(?:twitter\.com|x\.com)\/.*\/status/i,
  // Dailymotion
  /dailymotion\.com\/video\//i,
  // Twitch
  /twitch\.tv\//i,
  // NicoNico
  /nicovideo\.jp\/watch\//i,
  // Instagram
  /instagram\.com\/(?:reel|p|tv)\//i,
  // Facebook
  /facebook\.com\/.*\/videos\//i,
  /fb\.watch\//i,
  // Reddit
  /reddit\.com\/.*\/comments\//i,
  // 西瓜视频
  /ixigua\.com\//i,
  // 小红书
  /xiaohongshu\.com\//i,
  /xhslink\.com\//i,
  // 快手
  /kuaishou\.com\//i,
  // Rumble
  /rumble\.com\//i,
  // Odysee
  /odysee\.com\//i,
  // PeerTube (generic pattern)
  /\/videos\/watch\//i,
  // Streamable
  /streamable\.com\//i,
  // Loom
  /loom\.com\/share\//i,
  // 腾讯视频
  /v\.qq\.com\//i,
  // 优酷
  /youku\.com\/v_show\//i,
  // 爱奇艺
  /iqiyi\.com\//i,
  // 芒果TV
  /mgtv\.com\//i,
  // SoundCloud (audio, but yt-dlp supports it)
  /soundcloud\.com\//i,
  // Bandcamp
  /bandcamp\.com\/track\//i,
  // Weibo video
  /weibo\.com\/.*\/\d+/i,
  // AcFun
  /acfun\.cn\/v\//i,
]

/** Check whether a URL belongs to a known video platform (synchronous, instant). */
export function isVideoPlatformUrl(url: string): boolean {
  return VIDEO_PLATFORM_PATTERNS.some((pattern) => pattern.test(url))
}

