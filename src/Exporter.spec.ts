import * as chai from 'chai';
import * as sinon from 'sinon';
import { stub, spy } from 'sinon';
import { Observable, Subscription, Scheduler } from 'rxjs';
import { AsapScheduler } from 'rxjs/scheduler/AsapScheduler';
import { AsyncAction } from 'rxjs/scheduler/AsyncAction';
import { AsapAction } from 'rxjs/scheduler/AsapAction';

import { DbConfig, QueryConfig, Config } from './Config';
import { DbClient, ColumnValue } from './DbClient';
import { Exporter } from './Exporter';

const expect = chai.expect;

class TestScheduler extends AsapScheduler {
  constructor(private teardown: () => void) {
    super(AsapAction);
  }
  public flush(action: AsyncAction<any>): void {
    try {
      super.flush(action);
    } finally {
      this.teardown();
    }
  }
}

class Fixture {
  readonly dbConfig: DbConfig = {
    host: 'test.local',
    port: 3306,
    user: 'testuser',
    pass: 'testpass',
    databases: ['testschema'],
  };

  readonly query: QueryConfig = {
    name: 'mx_test',
    intervalSecs: 1,
    statement: 'SELECT count(1) AS count FROM foo',
    valueColumns: ['count'],
  };

  readonly dbClient: DbClient = {
    execute: (q: string, vc: string[], db: string) => {
      throw new Error('Mock has no stub on execute method');
    },
  };

  readonly mkColumnValue = (column: string, value: number) => {
    return Observable.of({ column, value });
  };

  readonly schedule = (exporter: Exporter, done?: MochaDone) => {
    const teardown = () => {
      if (done) {
        exporter.stop();
        done();
      }
    };
    const scheduler = new TestScheduler(teardown);
    return (...args) => {
      scheduler.schedule.apply(scheduler, args);
    };
  };
}

describe('scheduler', () => {
  it('should create metric with returned column and value', done => {
    const f = new Fixture();
    stub(f.dbClient, 'execute').returns(f.mkColumnValue('diff_name', 10));

    const config = { db: f.dbConfig, queries: [f.query] };
    const exporter = new Exporter(config, f.dbClient);
    exporter.start();

    f.schedule(exporter, done)(() => {
      const expected = 'mx_test_testschema_diff_name{db="testschema"} 10';
      expect(exporter.getMetrics()).to.have.string(expected);
    }, 1100);
  });

  it('should update metrics base on the configured interval', done => {
    const f = new Fixture();
    const dbClientStub = stub(f.dbClient, 'execute')
      .onFirstCall()
      .returns(f.mkColumnValue('count', 10))
      .onSecondCall()
      .returns(f.mkColumnValue('count', 99));

    const config = { db: f.dbConfig, queries: [f.query] };
    const exporter = new Exporter(config, f.dbClient);
    exporter.start();

    f.schedule(exporter)(() => {
      expect(exporter.getMetrics()).to.have.length(0);
    }, 900);

    f.schedule(exporter)(() => {
      const expected = 'mx_test_testschema_count{db="testschema"} 10';
      expect(exporter.getMetrics()).to.have.string(expected);
    }, 1100);

    f.schedule(exporter, done)(() => {
      const expected = 'mx_test_testschema_count{db="testschema"} 99';
      expect(exporter.getMetrics()).to.have.string(expected);
      expect(dbClientStub.callCount).to.eq(2);
    }, 2100);
  });

  it('should execute SQL query on all databases if no dbPattern', done => {
    const f = new Fixture();
    stub(f.dbClient, 'execute')
      .withArgs(f.query.statement, f.query.valueColumns, 'schema_a')
      .returns(f.mkColumnValue('count', 10))
      .withArgs(f.query.statement, f.query.valueColumns, 'schema_b')
      .returns(f.mkColumnValue('count', 99));

    const dbConfig = { ...f.dbConfig, databases: ['schema_a', 'schema_b'] };
    const query = { ...f.query, dbPattern: undefined };
    const config = { db: dbConfig, queries: [query] };
    const exporter = new Exporter(config, f.dbClient);
    exporter.start();

    f.schedule(exporter, done)(() => {
      const expected1 = 'mx_test_schema_a_count{db="schema_a"} 10';
      const expected2 = 'mx_test_schema_b_count{db="schema_b"} 99';
      expect(exporter.getMetrics()).to.have.string(expected1);
      expect(exporter.getMetrics()).to.have.string(expected2);
    }, 1100);
  });

  it('should execute SQL query on subset of databases if dbPattern specified', done => {
    const f = new Fixture();
    stub(f.dbClient, 'execute')
      .withArgs(f.query.statement, f.query.valueColumns, 'schema_a')
      .returns(f.mkColumnValue('count', 10))
      .withArgs(f.query.statement, f.query.valueColumns, 'schema_b')
      .returns(f.mkColumnValue('count', 99))
      .withArgs(f.query.statement, f.query.valueColumns, 'schema_c')
      .returns(f.mkColumnValue('count', 55));

    const dbConfig = {
      ...f.dbConfig,
      databases: ['schema_a', 'schema_b', 'schema_c'],
    };
    const query = { ...f.query, dbPattern: 'schema_[a|c]' };
    const config = { db: dbConfig, queries: [query] };
    const exporter = new Exporter(config, f.dbClient);
    exporter.start();

    f.schedule(exporter, done)(() => {
      const expected1 = 'mx_test_schema_a_count{db="schema_a"} 10';
      const expected2 = 'mx_test_schema_c_count{db="schema_c"} 55';
      expect(exporter.getMetrics()).to.have.string(expected1);
      expect(exporter.getMetrics()).to.have.string(expected2);
    }, 1100);
  });

  it('should export metrics for multiple configured columns', done => {
    const f = new Fixture();
    stub(f.dbClient, 'execute').returns(
      f.mkColumnValue('min', 10).merge(f.mkColumnValue('max', 66))
    );

    const query = { ...f.query, valueColumns: ['min', 'max'] };
    const config = { db: f.dbConfig, queries: [f.query] };
    const exporter = new Exporter(config, f.dbClient);
    exporter.start();

    f.schedule(exporter, done)(() => {
      const expected1 = 'mx_test_testschema_min{db="testschema"} 10';
      const expected2 = 'mx_test_testschema_max{db="testschema"} 66';
      expect(exporter.getMetrics()).to.have.string(expected1);
      expect(exporter.getMetrics()).to.have.string(expected2);
    }, 1100);
  });

  it('should stop fetching data after stop', done => {
    const f = new Fixture();
    const spyDbClient = stub(f.dbClient, 'execute')
      .onFirstCall()
      .returns(f.mkColumnValue('count', 10))
      .onSecondCall()
      .returns(f.mkColumnValue('count', 99));

    const config = { db: f.dbConfig, queries: [f.query] };
    const exporter = new Exporter(config, f.dbClient);
    exporter.start();

    f.schedule(exporter)(() => {
      const expected = 'mx_test_testschema_count{db="testschema"} 10';
      expect(exporter.getMetrics()).to.have.string(expected);
      exporter.stop();
    }, 1100);

    f.schedule(exporter, done)(() => {
      expect(spyDbClient.callCount).to.eq(1);
      const expected = 'mx_test_testschema_count{db="testschema"} 10';
      expect(exporter.getMetrics()).to.have.string(expected);
    }, 3100);
  });
});
