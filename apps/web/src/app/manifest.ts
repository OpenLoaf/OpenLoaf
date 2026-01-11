import type { MetadataRoute } from "next";

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "tenas-ai",
		short_name: "tenas-ai",
		description: "my pwa app",
		start_url: "/new",
		display: "standalone",
		background_color: "#ffffff",
		theme_color: "#000000",
		icons: [
			{
				src: "/favicon/web-app-manifest-192x192.png",
				sizes: "192x192",
				type: "image/png",
			},
			{
				src: "/favicon/web-app-manifest-512x512.png",
				sizes: "512x512",
				type: "image/png",
			},
		],
	};
}
