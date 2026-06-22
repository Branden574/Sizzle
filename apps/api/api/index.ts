// Vercel serverless entry for the Sizzle API. Local dev still uses
// src/index.ts (@hono/node-server); this wraps the same Hono app for Vercel.
import { handle } from 'hono/vercel';
import { createApp } from '../src/app';

export const config = { runtime: 'nodejs' };

export default handle(createApp());
