"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
const routes_1 = __importDefault(require("./routes"));
function createServer() {
    const app = (0, express_1.default)();
    // Configure EJS
    // Views are in src/web/views/ — at runtime this path works whether we're in src/ or dist/
    // because we serve from project root level
    app.set('view engine', 'ejs');
    // Support both dev (ts-node) and prod (node dist/) execution paths
    const viewsDir = path_1.default.join(__dirname, '..', '..', 'src', 'web', 'views');
    const fallbackDir = path_1.default.join(__dirname, 'views');
    const fs = require('fs');
    app.set('views', fs.existsSync(viewsDir) ? viewsDir : fallbackDir);
    // Body parsing
    app.use(express_1.default.json());
    app.use(express_1.default.urlencoded({ extended: true }));
    // Mount routes
    app.use('/', routes_1.default);
    // 404 handler
    app.use((req, res) => {
        res.status(404).send('<h1>404 Not Found</h1><p><a href="/">Back to dashboard</a></p>');
    });
    // Error handler
    app.use((err, req, res, _next) => {
        console.error('[Web] Error:', err.message);
        res.status(500).send(`<h1>Internal Server Error</h1><pre>${err.message}</pre>`);
    });
    return app;
}
function startServer(app) {
    app.listen(config_1.config.web.port, () => {
        console.log(`[Web] Dashboard running at http://localhost:${config_1.config.web.port}`);
    });
}
//# sourceMappingURL=server.js.map