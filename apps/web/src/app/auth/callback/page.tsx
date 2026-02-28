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
import { exchangeLoginCode } from "@/lib/saas-auth";

type Status = "loading" | "success" | "error";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
          <div className="rounded-2xl border border-border/60 bg-background px-6 py-8 text-center shadow-sm">
            <h1 className="text-lg font-semibold">正在完成登录</h1>
            <p className="mt-2 text-sm text-muted-foreground">请稍候...</p>
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
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    const code = search.get("code");
    const returnTo = search.get("returnTo") ?? "/";
    if (!code) {
      setStatus("error");
      return;
    }
    exchangeLoginCode({ loginCode: code, remember: true })
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
  }, [router, search]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="rounded-2xl border border-border/60 bg-background px-6 py-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold">
          {status === "loading"
            ? "正在完成登录"
            : status === "success"
              ? "登录成功"
              : "登录失败"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {status === "loading"
            ? "请稍候..."
            : status === "success"
              ? "正在跳转..."
              : "请返回并重试登录"}
        </p>
      </div>
    </div>
  );
}
