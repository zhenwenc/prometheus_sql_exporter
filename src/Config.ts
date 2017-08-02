import * as yaml from 'js-yaml';
import * as fs from 'fs';

import { getLogger } from './Logger';

const logger = getLogger('Config');

export interface DbConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly pass?: string;
  readonly databases: string[];
}

export interface QueryConfig {
  /* Name of the query, must be unique */
  readonly name: string;

  /* Interval in seconds to execute the query */
  readonly intervalSecs: number;

  /* SQL query statement */
  readonly statement: string;

  /* Query value columns needs to be exported */
  readonly valueColumns: string[];

  /* RegExp of targeted databases */
  readonly dbPattern?: string;
}

export interface Config {
  readonly db: DbConfig;
  readonly queries: QueryConfig[];
}

const verifyDbConfig = (config: DbConfig) => {
  if (typeof config === 'undefined') {
    throw new Error('Database config is required.');
  }
  if (typeof config.host === 'undefined') {
    throw new Error('Database hostname/ipaddress is required.');
  }
  if (typeof config.port === 'undefined') {
    throw new Error('Database port is required.');
  }
  if (typeof config.user === 'undefined') {
    throw new Error('Database user is requried.');
  }
  if (typeof config.pass === 'undefined') {
    logger.warn('No database password provided.');
  }
  if (typeof config.databases === 'undefined' || config.databases.length < 1) {
    throw new Error('Targeted databases is required.');
  }
};

const verifyQueryConfigs = (configs: QueryConfig[]) => {
  if (typeof configs === 'undefined') {
    throw new Error('No SQL query specified.');
  }
  configs.forEach(config => {
    if (typeof config.name === 'undefined') {
      throw new Error('Query name is required and must be unique.');
    }
    if (
      typeof config.intervalSecs === 'undefined' ||
      !Number.isInteger(config.intervalSecs) ||
      config.intervalSecs <= 0
    ) {
      throw new Error('Query intervalSecs must be positive integer.');
    }
    if (typeof config.statement === 'undefined') {
      throw new Error('Query statement is required.');
    }
    if (
      typeof config.valueColumns === 'undefined' ||
      !Array.isArray(config.valueColumns)
    ) {
      throw new Error('Query valueColumns is required and must be an array.');
    }
  });
};

export const loadConfig = (filePath: string): Config => {
  logger.info('Loading config from:', filePath);
  const config = yaml.safeLoad(fs.readFileSync(filePath, 'utf8')) as Config;
  logger.info('Loaded exporter config:', config);

  if (typeof config === 'undefined') {
    throw new Error(`Exporter config file [${filePath}] is empty.`);
  }
  verifyDbConfig(config.db);

  return config;
};
