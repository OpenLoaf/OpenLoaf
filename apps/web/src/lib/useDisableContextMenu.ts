"use client";

import { useEffect } from "react";

export function useDisableContextMenu() {
	useEffect(() => {
		const allowContextMenu = (target: EventTarget | null) =>
			target instanceof Element &&
			(target.closest("[data-radix-context-menu-trigger]") ||
				target.closest("[data-allow-context-menu]"));

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
