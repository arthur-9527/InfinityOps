import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createModuleLogger } from './utils/logger';

const logger = createModuleLogger('app');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/health', (req: Request, res: Response) => {
  logger.info('Health check requested');
  res.json({ status: 'ok' });
});

// Error handler middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error(`Error: ${err.message}`);
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

export default app; 