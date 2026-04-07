import { defineConfig } from "tsdown";

export default defineConfig({
	entry: { index: "src/index.ts" },
	outDir: "dist",
	format: ["cjs", "esm"],
	exports: true,
	platform: "node",
	sourcemap: true,
	dts: true,
	tsconfig: "./tsconfig.json",
	deps: {
		skipNodeModulesBundle: true,
	},
});