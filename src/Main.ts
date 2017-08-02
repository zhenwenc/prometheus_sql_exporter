import * as program from 'commander';
import * as http from 'http';

import { loadConfig } from './Config';
import { Exporter } from './Exporter';
import { MySqlClient } from './MySqlClient';
import { getLogger } from './Logger';

const PORT = 8080;
const logger = getLogger('Main');

program
  .version('1.0.0')
  .option(
    '--config <config>',
    'Path to exporter configuration file. Default: conf/exporter.yaml',
    /^.+\.(yaml|yml)$/i
  )
  .parse(process.argv);

const config = loadConfig(program.config || 'conf/exporter.yaml');
const dbClient = new MySqlClient(config.db);
const exporter = new Exporter(config, dbClient);

const server = http.createServer((req, res) => {
  if (req.url === '/metrics') {
    logger.info('received metrics request');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end(exporter.getMetrics());
  } else {
    res.statusCode = 404;
    res.end('404');
  }
});

exporter.start();
server.listen(PORT, err => {
  if (err) {
    logger.error('Failed to start server:', err);
  }
  logger.info('Server started on port', PORT);
});
