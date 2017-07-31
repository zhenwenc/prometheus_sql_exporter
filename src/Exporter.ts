import * as prom from 'prom-client';
import { Gauge } from 'prom-client';
import { Observable, Subscription, TestScheduler } from 'rxjs';

import { Config, QueryConfig } from './Config';
import { DbClient, ColumnValue } from './DbClient';
import { getLogger } from './Logger';

const logger = getLogger('Exporter');

interface Query extends QueryConfig {
  // Resolved targeted database
  readonly target: string;
}

export class Exporter {
  private readonly register: any;
  private readonly gauges = new Map<string, Gauge>();

  constructor(private config: Config, private dbClient: DbClient) {
    this.register = new prom.Registry();
    prom.collectDefaultMetrics({ registry: this.register });
  }

  public start() {
    this.runSchedulers().subscribe(
      next => {},
      error => logger.error('Failed to run scheduler:', error)
    );
  }

  public getMetrics() {
    return this.register.metrics();
  }

  private runSchedulers(): Observable<{}> {
    return Observable.from(this.config.queries)
      .flatMap(query => this.createQueries(query))
      .flatMap(query => this.schedule(query));
  }

  private schedule(query: Query) {
    return Observable.interval(query.intervalSecs * 1000 /* ms */)
      .flatMap(_ =>
        this.dbClient.execute(query.statement, query.valueColumns, query.target)
      )
      .map(data => this.updateGauge(query, data))
      .catch((error, caught) => {
        logger.error(error);
        return caught;
      })
      .onErrorResumeNext();
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
      });
      this.register.registerMetric(gauge);
      this.gauges.set(metric, gauge);
    }

    const gauge = this.gauges.get(metric)!;
    gauge.set({ db: query.target }, data.value);
  }
}
