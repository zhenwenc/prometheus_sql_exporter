import * as mysql from 'mysql';
import { Observable } from 'rxjs';

import { DbConfig } from './Config';
import { DbClient, ColumnValue } from './DbClient';
import { getLogger } from './Logger';

const logger = getLogger('MysqlExecutor');

export class MySqlClient implements DbClient {
  private readonly pools = new Map<string, mysql.IPool>();

  constructor(private config: DbConfig) {
    logger.info('Using MySQL client.');
  }

  private createConnectionPool(database: string) {
    return mysql.createPool({
      connectionLimit: 1,
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.pass,
      database: database,
    });
  }

  private getConnection(database: string): mysql.IPool {
    if (!this.pools.has(database)) {
      this.pools.set(database, this.createConnectionPool(database));
    }
    return this.pools.get(database)!;
  }

  public execute(query: string, valueColumns: string[], database: string) {
    return <Observable<ColumnValue>>Observable.create(observer => {
      const connection = this.getConnection(database);
      connection.query(query, (error, rs: Array<Object>, fields) => {
        if (error) {
          const msg = `Failed while executing [${query}]: [${error.code}] ${error.message}`;
          observer.error(new Error(msg));
        } else if (rs.length > 1) {
          const msg = `Only one row should be returned from [${query}], but ${rs}`;
          observer.error(new Error(msg));
        } else if (rs.length < 1) {
          logger.warn(`No result from [${query}], silently ignored`);
          observer.complete();
        } else {
          try {
            const metrics = this.parseResult(rs[0], valueColumns);
            metrics.forEach(metric => observer.next(metric));
            observer.complete();
          } catch (err) {
            const msg = `Failed while parsing result metric from [${query}]: ${err}`;
            observer.error(new Error(msg));
          }
        }
      });
    });
  }

  private parseResult(results: any, valueColumns: string[]) {
    return valueColumns.map(column => {
      const value = parseFloat(`${results[column]}`);
      if (isNaN(value) && isFinite(value)) {
        throw new Error(`Unexpected value [${value}] for column [${column}]`);
      } else {
        return { column, value };
      }
    });
  }

  public destroy() {
    logger.info('Destroy all MySQL connection pools');
    this.pools.forEach((pool, database) => pool.end());
  }
}
