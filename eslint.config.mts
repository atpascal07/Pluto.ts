import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import noStringConcatPreferTemplate from "./rules/no-string-concat-prefer-template.js";
import noDeprecatedFns from "./rules/no-deprecated-fns.js";
import noJsonStringify from "./rules/no-json-stringify.js";

const customPlugin = {
	rules: {
		"no-string-concat-prefer-template": noStringConcatPreferTemplate,
		"no-deprecated-fns": noDeprecatedFns,
		"no-json-stringify": noJsonStringify,
	},
} as any;

export default defineConfig([
	eslint.configs.recommended,
	...tseslint.configs.strict,
	...tseslint.configs.stylistic,
	{
		rules: {
			// ✅ TypeScript - Type Safety
			"@typescript-eslint/consistent-indexed-object-style": "error",
			"@typescript-eslint/array-type": "error",
			"@typescript-eslint/consistent-type-imports": "error",
			"@typescript-eslint/consistent-type-definitions": "error",
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-unsafe-function-type": "error",
			"@typescript-eslint/prefer-literal-enum-member": "error",
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"@typescript-eslint/naming-convention": [
				"error",
				{ selector: "default", format: ["camelCase"], leadingUnderscore: "allow" },
				{ selector: "variable", format: ["camelCase", "UPPER_CASE"], leadingUnderscore: "allow" },
				{ selector: "typeLike", format: ["PascalCase"] },
				{ selector: "enumMember", format: ["UPPER_CASE"] },
				{ selector: "objectLiteralProperty", format: null },
				{ selector: "import", format: ["camelCase", "PascalCase"], leadingUnderscore: "allow" },
			],

			// ⚠️ TypeScript - Less Strict (warnings)
			"@typescript-eslint/no-extraneous-class": "warn",
			"@typescript-eslint/no-empty-function": "warn",

			// 📋 ESLint - Code Quality
			"no-console": ["warn", { allow: ["warn", "error"] }],
			"no-debugger": "error",
			"no-var": "error",
			"prefer-const": "error",
			"prefer-arrow-callback": "error",
			"no-nested-ternary": "warn",
			"no-multiple-empty-lines": ["error", { max: 1 }],
			"eqeqeq": ["error", "always"],
			"quotes": ["error", "double", { avoidEscape: true }],
			"semi": ["error", "always"],
			"comma-dangle": ["error", "always-multiline"],
			"indent": ["error", "tab"],
			"object-curly-spacing": ["error", "always"],

			// 🚀 Custom Rules
			"custom/no-string-concat-prefer-template": "error",
			"custom/no-deprecated-fns": "error",
			"custom/no-json-stringify": "error",
		},
		plugins: {
			custom: {
				...customPlugin,
			},
		},
		ignores: [
			"scripts/generateEmojiEnum.ts",
			"src/Cluster/Utils/generated/EmojiNames.ts",
		],
	},
]);
