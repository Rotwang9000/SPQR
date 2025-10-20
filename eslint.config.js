/* eslint-env node */
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parser: tsparser,
			sourceType: "module",
			ecmaVersion: "latest"
		},
		plugins: { '@typescript-eslint': tseslint },
		rules: {
			"no-console": ["warn", { allow: ["warn", "error"] }],
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
		}
	}
];

