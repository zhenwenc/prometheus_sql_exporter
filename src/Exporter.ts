import * as prom from 'prom-client';
import { Gauge } from 'prom-client';
import { Observable, Subscription, Subject } from 'rxjs';

import { Config, QueryConfig } from './Config';
import { DbClient, ColumnValue } from './DbClient';
import { getLogger } from './Logger';

const logger = getLogger('Exporter');

interface Query extends QueryConfig {
  // Resolved targeted database
  readonly target: string;
}

export class Exporter {
  private register: prom.Registry;
  private gauges = new Map<string, Gauge>();
  private stopper = new Subject<{}>();

  constructor(private config: Config, private dbClient: DbClient) {
    this.register = new prom.Registry();
    prom.collectDefaultMetrics({ registry: this.register });
  }

  public start(): void {
    logger.info('Starting exporter schedulers...');
    this.runSchedulers()
      .takeUntil(this.stopper)
      .subscribe(
        next => {},
        error => logger.error('Failed to run scheduler:', error)
      );
  }

  public stop(): void {
    this.stopper.next({});
  }

  public getMetrics() {
    return this.register.metrics();
  }

  private runSchedulers(): Observable<any> {
    return Observable.from(this.config.queries)
      .flatMap(query => this.createQueries(query))
      .flatMap(query => this.schedule(query));
  }

  private schedule(query: Query): Observable<any> {
    return Observable.interval(query.intervalSecs * 1000 /* ms */)
      .merge(Observable.timer(250 /* initial */))
      .flatMap(_ =>
        this.dbClient
          .execute(query.statement, query.valueColumns, query.target)
          .catch((error, caught) => {
            logger.error(`Failed to execute query`, error);
            return Observable.empty<ColumnValue>();
          })
      )
      .map(data => this.updateGauge(query, data))
      .catch((error, caught) => {
        logger.error(`Failed to update gauge`, error);
        return Observable.empty();
      });
  }

  private createQueries(query: QueryConfig): Query[] {
    return this.config.db.databases
      .filter(database => {
        return (
          !query.dbPattern ||
          RegExp(`^${query.dbPattern}\$`, 'i').test(database)
        );
      })
      .map(target => ({ ...query, target }));
  }

  private updateGauge(query: Query, data: ColumnValue) {
    const metric = `${query.name}_${query.target}_${data.column}`;
    logger.info(`Update gauge ${metric} with values:`, data);

    if (!this.gauges.has(metric)) {
      const gauge = new prom.Gauge({
        name: metric,
        help: metric,
        labelNames: ['db'],
        registers: [this.register],
      });
      this.gauges.set(metric, gauge);
    }

    const gauge = this.gauges.get(metric)!;
    gauge.set({ db: query.target }, data.value);
  }
}
