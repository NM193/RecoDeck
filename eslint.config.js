import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist', 'src-tauri', 'mobile/dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The app's own tooltip replaces the system's (Micro-interactions spec,
    // Tooltips): data-tip, not title, on HTML elements and on Button, which
    // passes title through. Player.tsx is unused and left as it is.
    files: ['src/**/*.tsx'],
    ignores: ['src/components/Player.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXOpeningElement[name.type='JSXIdentifier'][name.name=/^([a-z]|Button$)/] > JSXAttribute[name.name='title']",
          message: 'Use data-tip (the app tooltip, TooltipLayer), not title.',
        },
        {
          // motion.button and the like render the HTML element too.
          selector:
            "JSXOpeningElement[name.type='JSXMemberExpression'][name.property.name=/^[a-z]/] > JSXAttribute[name.name='title']",
          message: 'Use data-tip (the app tooltip, TooltipLayer), not title.',
        },
      ],
    },
  },
  prettierConfig,
)
