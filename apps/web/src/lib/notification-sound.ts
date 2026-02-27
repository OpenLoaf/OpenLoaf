/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

type NotificationSoundKind = "dictation-start" | "model-start" | "model-end";

type TonePreset = {
  frequency: number;
  duration: number;
  volume: number;
  type: OscillatorType;
};

/** Tone presets for UI notification sounds. */
const TONE_PRESETS: Record<NotificationSoundKind, TonePreset> = {
  "dictation-start": {
    frequency: 880,
    duration: 0.12,
    volume: 0.04,
    type: "sine",
  },
  "model-start": {
    frequency: 720,
    duration: 0.1,
    volume: 0.035,
    type: "triangle",
  },
  "model-end": {
    frequency: 520,
    duration: 0.14,
    volume: 0.04,
    type: "sine",
  },
};

let cachedAudioContext: AudioContext | null = null;

/** Resolve a shared AudioContext instance if supported. */
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!cachedAudioContext) {
    cachedAudioContext = new AudioContextCtor();
  }
  return cachedAudioContext;
}

/** Play a short notification tone in the browser. */
export function playNotificationSound(kind: NotificationSoundKind) {
  const preset = TONE_PRESETS[kind];
  if (!preset) return;
  const context = getAudioContext();
  if (!context) return;

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = preset.type;
  oscillator.frequency.value = preset.frequency;
  gainNode.gain.value = preset.volume;
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  if (context.state === "suspended") {
    void context.resume();
  }
  const now = context.currentTime;
  oscillator.start(now);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);
  oscillator.stop(now + preset.duration);
  oscillator.onended = () => {
    oscillator.disconnect();
    gainNode.disconnect();
  };
}
