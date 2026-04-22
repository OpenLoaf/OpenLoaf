"use client";

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { isElectronEnv } from "@/utils/is-electron-env";
import { fetchBlobFromUri } from "@/lib/image/uri";

export type SaveAsOptions = {
  uri: string;
  name: string;
  projectId?: string;
  sessionId?: string;
  defaultDir?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
};

export type SaveAsResult = {
  ok: true;
  path: string;
} | {
  ok: false;
  canceled?: boolean;
  reason?: string;
};

export function useSaveAs() {
  const { t } = useTranslation("common");

  const handleSaveAs = useCallback(async (options: SaveAsOptions): Promise<SaveAsResult> => {
    const { uri, name, projectId, sessionId, defaultDir, filters } = options;

    try {
      const blob = await fetchBlobFromUri(uri, { projectId, sessionId });
      const buffer = await blob.arrayBuffer();

      const contentBase64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      if (!isElectronEnv() || !window.openloafElectron?.saveFile) {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = name;
        link.click();
        URL.revokeObjectURL(link.href);
        return { ok: true, path: name };
      }

      const result = await window.openloafElectron.saveFile({
        contentBase64,
        defaultDir,
        suggestedName: name,
        filters: filters ?? [{ name: "All Files", extensions: ["*"] }],
      });

      if (!result?.ok) {
        if (result?.canceled) {
          return { ok: false, canceled: true };
        }
        toast.error(result?.reason ?? t("saveFailed"));
        return { ok: false, reason: result?.reason };
      }

      toast.success(t("fileSaved"));
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(errorMessage ?? t("saveFailed"));
      return { ok: false, reason: errorMessage };
    }
  }, [t]);

  return { handleSaveAs };
}
