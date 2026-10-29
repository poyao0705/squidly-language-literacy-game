import { defineConfig } from "vite";

export default defineConfig({
	server: {
		host: "0.0.0.0",
		port: 5501,
		cors: true,
	},
	base: "/",
	build: {
		rolldownOptions: {
			output: {
				entryFileNames: "assets/[name].js",
				chunkFileNames: "assets/[name].js",
				assetFileNames: "assets/[name][extname]",
			},
		},
	},
});
