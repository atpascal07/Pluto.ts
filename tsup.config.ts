import { defineConfig } from "tsdown";

export default defineConfig({
	entry: { index: "src/index.ts" },
	outDir: "dist",
	format: ["cjs"],
	platform: "node",
	sourcemap: true,
	dts: true,
	tsconfig: "./tsconfig.json",
	deps: {
		skipNodeModulesBundle: true,
	},
});