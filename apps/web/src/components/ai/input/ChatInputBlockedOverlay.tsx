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

import { Cloud, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface ChatInputBlockedOverlayProps {
  blockedReason?: 'cloud-login' | 'local-empty' | 'unconfigured';
  blockedCompact?: boolean;
  onRequestLogin?: () => void;
  onRequestLocalConfig?: () => void;
  onRequestSwitchLocal?: () => void;
  onRequestSwitchCloud?: () => void;
}

export function ChatInputBlockedOverlay({
  blockedReason,
  blockedCompact = false,
  onRequestLogin,
  onRequestLocalConfig,
  onRequestSwitchLocal,
  onRequestSwitchCloud,
}: ChatInputBlockedOverlayProps) {
  const { t } = useTranslation('ai');

  return (
    <div className={cn("flex flex-col items-center justify-center gap-2.5 px-5 py-4", blockedCompact && "min-h-[104px]")}>
      {!blockedCompact && (
        <img
          src="/logo_nobody.png"
          alt="OpenLoaf"
          className="size-12 object-contain"
        />
      )}
      {!blockedCompact && (
        <div className="text-center">
          <p className="text-[13px] font-medium text-ol-text-primary">
            {blockedReason === 'cloud-login'
              ? t('blocked.titleCloudLogin')
              : blockedReason === 'local-empty'
                ? t('blocked.titleLocalEmpty')
                : t('blocked.titleDefault')}
          </p>
          <p className="mt-0.5 text-[11px] text-ol-text-auxiliary">
            {blockedReason === 'cloud-login'
              ? t('blocked.descCloudLogin')
              : blockedReason === 'local-empty'
                ? onRequestSwitchCloud
                  ? t('blocked.descLocalEmptySwitch')
                  : t('blocked.descDefault')
                : t('blocked.descDefault')}
          </p>
        </div>
      )}
      <div className="flex items-center gap-2">
        {blockedReason === 'local-empty' && onRequestSwitchCloud ? (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ol-blue-bg px-4 text-[12px] font-medium text-ol-blue transition-colors duration-150 hover:bg-ol-blue-bg-hover disabled:opacity-50"
            onClick={onRequestSwitchCloud}
          >
            <Cloud className="size-3.5" />
            {t('blocked.btnSwitchCloud')}
          </button>
        ) : (
          <button
            type="button"
            className="h-8 rounded-full bg-ol-blue-bg px-4 text-[12px] font-medium text-ol-blue transition-colors duration-150 hover:bg-ol-blue-bg-hover disabled:opacity-50"
            onClick={onRequestLogin}
            disabled={!onRequestLogin}
          >
            {t('blocked.btnLoginCloud')}
          </button>
        )}
        {blockedReason === 'cloud-login' && onRequestSwitchLocal ? (
          <button
            type="button"
            className="h-8 rounded-full bg-ol-surface-muted px-4 text-[12px] font-medium text-ol-text-secondary transition-colors duration-150 hover:bg-ol-divider"
            onClick={onRequestSwitchLocal}
          >
            {t('blocked.btnSwitchLocal')}
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ol-surface-muted px-4 text-[12px] font-medium text-ol-text-secondary transition-colors duration-150 hover:bg-ol-divider disabled:opacity-50"
            onClick={onRequestLocalConfig}
            disabled={!onRequestLocalConfig}
          >
            <Settings2 className="size-3.5" />
            {t('blocked.btnConfigLocal')}
          </button>
        )}
      </div>
    </div>
  );
}
