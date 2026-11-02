import type { CSSModulesOptions } from 'vite'

// The client build and the prerender build must give CSS Modules the same
// class names, or the prerendered HTML would point at classes that don't exist.
export const cssModules: CSSModulesOptions = {
  generateScopedName: '[local]_[hash:base64:5]',
}
