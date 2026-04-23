import type { StorybookConfig } from '@storybook/nextjs-vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const appWebRoot = resolve(root, '..')

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
  ],
  framework: {
    name: '@storybook/nextjs-vite',
    options: {},
  },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
  staticDirs: ['../public'],
  viteFinal: async (cfg) => {
    cfg.resolve ??= {}
    cfg.resolve.alias = {
      ...(cfg.resolve.alias as Record<string, string> | undefined),
      '@': resolve(appWebRoot, 'src'),
      '@openloaf/ui': resolve(appWebRoot, '../../packages/ui/src'),
    }
    return cfg
  },
}

export default config
