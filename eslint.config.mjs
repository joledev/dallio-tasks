import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'coverage/**'],
  },
  // Layering boundary: app/ route handlers & components must go through core/ use-cases,
  // never touch Prisma or a repository implementation directly. Makes the seam provable.
  {
    files: ['src/app/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message: 'Do not import @prisma/client from src/app/**. Go through a core/ use-case.',
            },
          ],
          patterns: [
            {
              group: ['**/prisma-repository', '**/*-prisma-repository'],
              message:
                'Do not import a Prisma repository from src/app/**. Go through a core/ use-case.',
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
