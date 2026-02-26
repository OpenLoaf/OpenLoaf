/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\ndeclare module "@/lib/utils" {
  export function cn(...inputs: any[]): string;
}

declare module "@/lib/get-strict-context" {
  import type * as React from "react";

  export function getStrictContext<T>(
    name?: string
  ): readonly [
    (props: { value: T; children?: React.ReactNode }) => React.JSX.Element,
    () => T
  ];
}

declare module "@/lib/theme-override" {
  export function clearThemeOverride(): void;
  export function writeThemeOverride(theme: string): void;
}

declare module "@/components/ThemeProvider" {
  import type * as React from "react";

  export const ThemeToggler: React.ComponentType<any>;
}

declare module "@/components/editor/editor-base-kit" {
  export const BaseEditorKit: any;
}

declare module "@/components/editor/plugins/basic-marks-kit" {
  export const BasicMarksKit: any;
}

declare module "@/components/editor/plugins/comment-kit" {
  export const commentPlugin: any;
}

declare module "@/components/editor/plugins/discussion-kit" {
  export type TDiscussion = any;
  export const discussionPlugin: any;
}

declare module "@/components/editor/plugins/suggestion-kit" {
  export type SuggestionConfig = any;
  export const suggestionPlugin: any;
}

declare module "@/components/editor/transforms" {
  export const insertBlock: any;
  export const insertInlineElement: any;
  export const getBlockType: any;
  export const setBlockType: any;
}

declare module "@/components/project/filesystem/utils/file-system-utils" {
  export function parseScopedProjectPath(value: string): {
    projectId?: string;
    relativePath: string;
  } | null;
}

declare module "@/hooks/use-basic-config" {
  export function useBasicConfig(): {
    basic: Record<string, any>;
    setBasic: (update: any) => Promise<void> | void;
    isLoading?: boolean;
  };
}

declare module "@/hooks/use-debounce" {
  export function useDebounce<T>(value: T, delay?: number): T;
}

declare module "@/hooks/use-upload-file" {
  export type UploadedFile = any;
  export function useUploadFile(...args: any[]): {
    isUploading: boolean;
    progress: number;
    uploadedFile?: UploadedFile;
    uploadFile: (file: File) => Promise<UploadedFile | undefined>;
    uploadingFile?: File;
  };
}

declare module "@/hooks/use-mounted" {
  export function useMounted(): boolean;
}

declare module "@/hooks/use-mobile" {
  export function useIsMobile(): boolean;
  export function useIsNarrowScreen(breakpoint?: number): boolean;
}

declare module "@/hooks/use-is-touch-device" {
  export function useIsTouchDevice(): boolean;
}

declare module "@/hooks/use-is-in-view" {
  import type * as React from "react";
  import type { UseInViewOptions } from "motion/react";

  export interface UseIsInViewOptions {
    inView?: boolean;
    inViewOnce?: boolean;
    inViewMargin?: UseInViewOptions["margin"];
  }

  export function useIsInView<T extends HTMLElement = HTMLElement>(
    ref: React.Ref<T>,
    options?: UseIsInViewOptions
  ): { ref: React.RefObject<T>; isInView: boolean };
}

declare module "@/hooks/use-auto-height" {
  import type * as React from "react";

  export type AutoHeightOptions = {
    includeParentBox?: boolean;
    includeSelfBox?: boolean;
  };

  export function useAutoHeight<T extends HTMLElement = HTMLDivElement>(
    deps?: React.DependencyList,
    options?: AutoHeightOptions
  ): { ref: React.RefObject<T>; height: number };
}

declare module "@/hooks/use-controlled-state" {
  export function useControlledState<T, Rest extends any[] = []>(props: {
    value?: T;
    defaultValue?: T;
    onChange?: (value: T, ...args: Rest) => void;
  }): readonly [T, (next: T, ...args: Rest) => void];
}

declare module "@/hooks/use-data-state" {
  import type * as React from "react";

  export type DataStateValue = string | boolean | null;

  export function useDataState<T extends HTMLElement = HTMLElement>(
    key: string,
    forwardedRef?: React.Ref<T | null>,
    onChange?: (value: DataStateValue) => void
  ): [DataStateValue, React.RefObject<T | null>];
}
