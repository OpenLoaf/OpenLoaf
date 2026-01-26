import type { AttachmentResolverPort } from "@/ai/image/AttachmentResolverPort";

export type { AttachmentResolverPort } from "@/ai/image/AttachmentResolverPort";

export type ImagePorts = {
  /** Resolver for image attachments. */
  attachmentResolver: AttachmentResolverPort;
};
