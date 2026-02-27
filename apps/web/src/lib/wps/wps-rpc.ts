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

type WpsAddonElement = {
  name: string;
  addonType: "wps" | "et" | "wpp";
  online: "true" | "false";
  url: string;
};

type WpsInvokeResult = {
  status?: number;
  message?: string;
};

type WpsAddonResult = {
  status?: boolean | number;
  msg?: string;
  response?: string;
};

declare global {
  interface Window {
    WpsAddonMgr?: {
      verifyStatus: (element: WpsAddonElement, cb?: (result: WpsAddonResult) => void) => void;
      enable: (element: WpsAddonElement, cb?: (result: WpsAddonResult) => void) => void;
    };
    WpsInvoke?: {
      ClientType: Record<"wps" | "et" | "wpp", any>;
      InvokeAsHttp: (
        clientType: any,
        addonName: string,
        funcName: string,
        payload: string,
        cb?: (result: WpsInvokeResult) => void,
      ) => void;
      IsClientRunning: (clientType: any, cb?: (result: { status?: number }) => void) => void;
    };
  }
}

let loadPromise: Promise<void> | null = null;

function resolveSdkUrl() {
  return process.env.NEXT_PUBLIC_WPS_RPC_SDK_URL || "/wpsjsrpcsdk.js";
}

function ensureSdkGlobals() {
  if (!window.WpsAddonMgr || !window.WpsInvoke) {
    throw new Error("wpsjsrpcsdk.js not loaded");
  }
}

export async function loadWpsRpcSdk(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.WpsAddonMgr && window.WpsInvoke) return;
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = resolveSdkUrl();
    script.async = true;
    script.onload = () => {
      try {
        ensureSdkGlobals();
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => {
      reject(new Error("Failed to load wpsjsrpcsdk.js"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

function resolveAddonError(result?: WpsAddonResult) {
  if (!result) return null;
  if (result.status === true) return result.msg || "WPS addin error";
  return null;
}

export async function ensureAddonInstalled(element: WpsAddonElement): Promise<void> {
  await loadWpsRpcSdk();
  ensureSdkGlobals();

  await new Promise<void>((resolve, reject) => {
    window.WpsAddonMgr!.verifyStatus(element, (result) => {
      const errorText = resolveAddonError(result);
      if (!errorText) {
        resolve();
        return;
      }
      window.WpsAddonMgr!.enable(element, (enableResult) => {
        const enableError = resolveAddonError(enableResult);
        if (enableError) {
          reject(new Error(enableError));
          return;
        }
        resolve();
      });
    });
  });
}

export async function invokeWpsOpen(input: {
  addonType: "wps" | "et" | "wpp";
  addonName: string;
  funcName: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await loadWpsRpcSdk();
  ensureSdkGlobals();

  await new Promise<void>((resolve, reject) => {
    const clientType = window.WpsInvoke!.ClientType[input.addonType];
    window.WpsInvoke!.InvokeAsHttp(
      clientType,
      input.addonName,
      input.funcName,
      JSON.stringify(input.payload ?? {}),
      (result) => {
        if (result && typeof result.status === "number" && result.status !== 0) {
          reject(new Error(result.message || "InvokeAsHttp failed"));
          return;
        }
        resolve();
      },
    );
  });
}

export async function isWpsRunning(addonType: "wps" | "et" | "wpp"): Promise<boolean> {
  await loadWpsRpcSdk();
  ensureSdkGlobals();
  return await new Promise<boolean>((resolve) => {
    const clientType = window.WpsInvoke!.ClientType[addonType];
    window.WpsInvoke!.IsClientRunning(clientType, (result) => {
      resolve(Boolean(result && result.status === 0));
    });
  });
}
