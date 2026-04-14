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

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { exchangeLoginCode } from "@/lib/saas-auth";

type Status = "loading" | "success" | "error";

export default function AuthCallbackPage() {
  const { t } = useTranslation('common');
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
          <div className="rounded-2xl border border-border/60 bg-background px-6 py-8 text-center shadow-sm">
            <h1 className="text-lg font-semibold">{t('login.completing')}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t('login.pleaseWait')}</p>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}

function AuthCallbackContent() {
  const router = useRouter();
  const search = useSearchParams();
  const { t } = useTranslation('common');
  const loginCode = search.get("code");
  const returnTo = search.get("returnTo") ?? "/";
  const [status, setStatus] = useState<Status>(
    loginCode ? "loading" : "error",
  );
  const effectiveStatus = loginCode ? status : "error";

  useEffect(() => {
    if (!loginCode) return;
    exchangeLoginCode({ loginCode })
      .then((user) => {
        if (!user) {
          setStatus("error");
          return;
        }
        setStatus("success");
        const nextPath = returnTo as unknown as Parameters<typeof router.replace>[0];
        router.replace(nextPath);
      })
      .catch(() => setStatus("error"));
  }, [loginCode, returnTo, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="rounded-2xl border border-border/60 bg-background px-6 py-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold">
          {effectiveStatus === "loading"
            ? t('login.completing')
            : effectiveStatus === "success"
              ? t('login.success')
              : t('login.failed')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {effectiveStatus === "loading"
            ? t('login.pleaseWait')
            : effectiveStatus === "success"
              ? t('login.redirecting')
              : t('login.tryAgain')}
        </p>
      </div>
    </div>
  );
}
