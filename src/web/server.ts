import express from 'express';
import path from 'path';
import { config } from '../config';
import router from './routes';

function basicAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="TaskToChat"');
    res.status(401).send('Authentication required');
    return;
  }

  const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
  const [user, pass] = credentials.split(':');

  const validUser = process.env.DASHBOARD_USER || 'admin';
  const validPass = process.env.DASHBOARD_PASS || 'tasktochat2026';

  if (user === validUser && pass === validPass) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="TaskToChat"');
    res.status(401).send('Invalid credentials');
  }
}

export function createServer(): express.Application {
  const app = express();

  // Configure EJS
  app.set('view engine', 'ejs');
  const viewsDir = path.join(__dirname, '..', '..', 'src', 'web', 'views');
  const fallbackDir = path.join(__dirname, 'views');
  const fs = require('fs');
  app.set('views', fs.existsSync(viewsDir) ? viewsDir : fallbackDir);

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Basic auth on all routes
  app.use(basicAuth);

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
