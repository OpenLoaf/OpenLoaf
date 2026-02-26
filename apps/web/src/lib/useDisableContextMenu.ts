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

import { useEffect } from "react";

export function useDisableContextMenu() {
	useEffect(() => {
		const allowContextMenu = (target: EventTarget | null) => {
			const element =
				target instanceof Element
					? target
					: target instanceof Node
						? target.parentElement
						: null;
			if (!element) return false;
			// 逻辑：容器命中需向上查找，避免 Text/SVG 节点导致误判。
			return Boolean(
				element.closest("[data-radix-context-menu-trigger]") ||
					element.closest("[data-allow-context-menu]")
			);
		};

		const handleContextMenu = (event: MouseEvent) => {
			if (allowContextMenu(event.target)) return;
			event.preventDefault();
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (allowContextMenu(event.target)) return;
			if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
				event.preventDefault();
			}
		};

		document.addEventListener("contextmenu", handleContextMenu);
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("contextmenu", handleContextMenu);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, []);
}
