export default {
  plugins: [
    {
      name: 'assert-portable-package-graph',
      generateBundle() {
        for (const id of this.getModuleIds()) {
          const moduleId = id.replaceAll('\\', '/');
          if (
            moduleId.includes('__vite-browser-external') ||
            moduleId.startsWith('node:') ||
            moduleId.includes('/node_modules/qrcode/') ||
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
};
