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

import { AudioElement } from '@openloaf/ui/media-audio-node';
import { MediaEmbedElement } from '@openloaf/ui/media-embed-node';
import { FileElement } from '@openloaf/ui/media-file-node';
import { ImageElement } from '@openloaf/ui/media-image-node';
import { PlaceholderElement } from '@openloaf/ui/media-placeholder-node';
import { MediaPreviewDialog } from '@openloaf/ui/media-preview-dialog';
import { MediaUploadToast } from '@openloaf/ui/media-upload-toast';
import { VideoElement } from '@openloaf/ui/media-video-node';

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
