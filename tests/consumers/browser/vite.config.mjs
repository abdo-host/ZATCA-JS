export default ({ mode }) => ({
  build: {
    rolldownOptions: {
      input: mode === 'render' ? 'render.html' : 'index.html',
    },
  },
  plugins: [
    {
      name: 'assert-portable-package-graph',
      generateBundle() {
        for (const id of this.getModuleIds()) {
          const moduleId = id.replaceAll('\\', '/');
          if (
            moduleId.includes('__vite-browser-external') ||
            moduleId.startsWith('node:') ||
            (mode !== 'render' && moduleId.includes('/node_modules/qrcode/')) ||
            moduleId.includes('/qrcode/lib/server.js') ||
            moduleId.includes('/node_modules/pngjs/') ||
            moduleId.includes('/zatca/dist/index.')
          ) {
            this.error(
              `The browser graph reached a Node dependency: ${moduleId}`,
            );
          }
        }
      },
    },
  ],
});
