import express from 'express';
import path from 'path';
import { config } from '../config';
import router from './routes';

export function createServer(): express.Application {
  const app = express();

  // Configure EJS
  // Views are in src/web/views/ — at runtime this path works whether we're in src/ or dist/
  // because we serve from project root level
  app.set('view engine', 'ejs');
  // Support both dev (ts-node) and prod (node dist/) execution paths
  const viewsDir = path.join(__dirname, '..', '..', 'src', 'web', 'views');
  const fallbackDir = path.join(__dirname, 'views');
  const fs = require('fs');
  app.set('views', fs.existsSync(viewsDir) ? viewsDir : fallbackDir);

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Mount routes
  app.use('/', router);

  // 404 handler
  app.use((req, res) => {
    res.status(404).send('<h1>404 Not Found</h1><p><a href="/">Back to dashboard</a></p>');
  });

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Web] Error:', err.message);
    res.status(500).send(`<h1>Internal Server Error</h1><pre>${err.message}</pre>`);
  });

  return app;
}

export function startServer(app: express.Application): void {
  app.listen(config.web.port, () => {
    console.log(`[Web] Dashboard running at http://localhost:${config.web.port}`);
  });
}
