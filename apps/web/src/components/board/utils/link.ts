import type { LinkNodeProps } from "../nodes/LinkNode";

export type LinkNodePayload = {
  /** Props used to create the link node. */
  props: LinkNodeProps;
  /** Suggested node size in world coordinates. */
  size: [number, number];
};

const DEFAULT_LINK_SIZE: [number, number] = [720, 120];

/** Build a link node payload from a URL string. */
export function buildLinkNodePayloadFromUrl(url: string): LinkNodePayload {
  const safeUrl = url.trim();
  let hostname = safeUrl;
  try {
    const parsed = new URL(safeUrl);
    hostname = parsed.hostname;
  } catch {
    // Fallback to raw text when URL parsing fails.
  }

  const displayHost = hostname.replace(/^www\./, "");
  const logoSrc = "";
  return {
    props: {
      url: safeUrl,
      title: displayHost || safeUrl,
      description: "",
      logoSrc,
      imageSrc: "",
      refreshToken: 0,
    },
    size: DEFAULT_LINK_SIZE,
  };
}
