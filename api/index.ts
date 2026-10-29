import express from 'express';
import type { Express } from 'express';
import { createProductionApp } from '../src/server/productionApp';

const app = express();
let ready: Promise<Express> | null = null;

app.use(async (req, res, next) => {
  try {
    if (!ready) ready = createProductionApp();
    const inner = await ready;
    inner(req, res, next);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The API failed to start.';
    res.status(503).json({ ok: false, message });
  }
});

export default app;
