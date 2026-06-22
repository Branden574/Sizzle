// Source entry for the Vercel function. scripts/build-vercel.mjs esbuild-bundles
// this (and the whole src/ tree) into one self-contained file under
// .vercel/output, so there are no runtime relative-import lookups. Local dev
// still uses src/index.ts (@hono/node-server).
import { getRequestListener } from '@hono/node-server';
import { createApp } from '../src/app';

const app = createApp();

// A Node (req, res) handler for Vercel's Build Output API "Nodejs" launcher.
export default getRequestListener((request) => app.fetch(request));
