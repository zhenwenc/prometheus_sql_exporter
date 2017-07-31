import { Observable } from 'rxjs';

export interface DbClient {
  execute(
    query: string,
    valueColumns: string[],
    database: string
  ): Observable<ColumnValue>;
}

export interface ColumnValue {
  readonly column: string;
  readonly value: number;
}
