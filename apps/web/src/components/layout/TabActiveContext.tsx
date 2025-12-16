"use client";

import * as React from "react";

const TabActiveContext = React.createContext<boolean>(true);

export function TabActiveProvider({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return <TabActiveContext.Provider value={active}>{children}</TabActiveContext.Provider>;
}

export function useTabActive() {
  return React.useContext(TabActiveContext);
}
