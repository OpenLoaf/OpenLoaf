/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\ndeclare module "@openloaf/api" {
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
