/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

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
