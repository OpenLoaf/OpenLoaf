declare module "@openloaf/api" {
  export type WebMetadata = {
    /** Page title text. */
    title: string;
    /** Page description text. */
    description: string;
    /** Icon URL resolved for the page. */
    iconUrl: string;
  };

  /** Parse metadata from HTML and resolve icon URLs. */
  export function parseWebMetadataFromHtml(html: string, url: string): WebMetadata;
}
