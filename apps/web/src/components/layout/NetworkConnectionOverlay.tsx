"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { networkConnection } from "@/utils/trpc";
import { LoadingScreen } from "@/components/layout/LoadingScreen";

export default function NetworkConnectionOverlay() {
  const isDown = useSyncExternalStore(
    networkConnection.subscribe,
    networkConnection.getSnapshot,
    networkConnection.getSnapshot
  );
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  useEffect(() => {
    function onOnline() {
      setIsOffline(false);
      networkConnection.setDown(false);
    }

    function onOffline() {
      setIsOffline(true);
    }

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!isOffline && !isDown) return null;

  return (
    <div className="fixed inset-0 z-50">
      <LoadingScreen
        label={isOffline ? "No network connection..." : "Reconnecting..."}
      />
    </div>
  );
}

