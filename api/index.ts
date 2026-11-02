process.env.IS_SERVERLESS = '1';
import { createExpressApp } from '../server.ts';

const app = createExpressApp();

export default app;
