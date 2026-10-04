import { defineConfig } from 'wxt';

// Both browsers build from the same entrypoints as Manifest V3. WXT targets Manifest V2 for
// Firefox unless told otherwise. The version comes from package.json.
export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  outDir: 'dist',
  outDirTemplate: '{{browser}}',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  imports: false,
  // Unminified output keeps the packages readable for store review. Debug comments would embed
  // absolute source paths, which differ between machines and break reproducible builds.
  vite: () => ({ build: { minify: false, rolldownOptions: { experimental: { attachDebugInfo: 'none' } } } }),
  manifest: ({ browser }) => ({
    name: 'Unqlock',
    description: 'Style and compact Unqork components, control builder panels, identify environments, and debug application data.',
    icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
    permissions: ['storage', 'activeTab', 'scripting'],
    optional_host_permissions: ['*://*/*'],
    web_accessible_resources: [{ resources: ['icons/icon-32.png', 'popup.html'], matches: ['http://*/*', 'https://*/*'] }],
    action: { default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' }, default_title: 'Unqlock' },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: 'unqlock@fusan.me', strict_min_version: '142.0', data_collection_permissions: { required: ['none'] } }
          }
        }
      : { minimum_chrome_version: '111' })
  })
});
