// dsh-reboot dual-half build.
//
// Node target: the Cordis host half — `lib/index.js` (ESM).
// Browser target: the client half — `lib/client.js` (CJS, registers via
// `window.__ModuleLoader__.load`). React/cordis are externals resolved from the
// web shell's frozen module table at runtime.

const CLIENT_EXTERNALS = ['react', 'react/jsx-runtime', 'cordis']

const PLUGIN_ID = 'dsh-reboot'

export default [
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    fixedExtension: false,
    dts: false,
    sourcemap: false,
    clean: false,
  },
  {
    entry: { client: 'src/client/index.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: false,
    clean: false,
    external: CLIENT_EXTERNALS,
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      codeSplitting: false,
    },
  },
]
