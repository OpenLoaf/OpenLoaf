'use client';

import { CaptionPlugin } from '@platejs/caption/react';
import {
  AudioPlugin,
  FilePlugin,
  ImagePlugin,
  MediaEmbedPlugin,
  PlaceholderPlugin,
  VideoPlugin,
} from '@platejs/media/react';
import { KEYS } from 'platejs';

import { AudioElement } from '@tenas-ai/ui/media-audio-node';
import { MediaEmbedElement } from '@tenas-ai/ui/media-embed-node';
import { FileElement } from '@tenas-ai/ui/media-file-node';
import { ImageElement } from '@tenas-ai/ui/media-image-node';
import { PlaceholderElement } from '@tenas-ai/ui/media-placeholder-node';
import { MediaPreviewDialog } from '@tenas-ai/ui/media-preview-dialog';
import { MediaUploadToast } from '@tenas-ai/ui/media-upload-toast';
import { VideoElement } from '@tenas-ai/ui/media-video-node';

export const MediaKit = [
  ImagePlugin.configure({
    options: { disableUploadInsert: true },
    render: { afterEditable: MediaPreviewDialog, node: ImageElement },
  }),
  MediaEmbedPlugin.withComponent(MediaEmbedElement),
  VideoPlugin.withComponent(VideoElement),
  AudioPlugin.withComponent(AudioElement),
  FilePlugin.withComponent(FileElement),
  PlaceholderPlugin.configure({
    options: { disableEmptyPlaceholder: true },
    render: { afterEditable: MediaUploadToast, node: PlaceholderElement },
  }),
  CaptionPlugin.configure({
    options: {
      query: {
        allow: [KEYS.img, KEYS.video, KEYS.audio, KEYS.file, KEYS.mediaEmbed],
      },
    },
  }),
];
