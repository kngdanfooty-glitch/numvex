import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // The shared package ships raw .ts, so bundle it into the output.
  noExternal: [/^@numvexs\/shared/],
});
