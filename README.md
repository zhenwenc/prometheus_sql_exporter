# Prometheus SQL Exporter

Exports configured SQL query results from a database for Prometheus.

## What Problem Are We Solving

We have multiple MySQL database instances, where each instance contains multiple tenants. Each MySQL instance is sturctured as follows:

    schema_x_tenant_a:
      table_x
    schema_x_tenant_b:
      table_x
    schema_y_tenant_a:
      table_y
    schema_y_tenant_b:
      table_y
    schema_shared:
      table_z

As you see, we have multi-tenant databases with inconsistent schema structure, where each configured SQL query needs to have a targeted subset of all schemas. We would like to deploy one exporter for each database instance that executes the configured SQL queries and exports the results for Prometheus. 

## Other Prometheus SQL Exporter

Please consider using these exporters if they meet your requirements.

- MySQL: [prometheus-sql](https://github.com/chop-dbhi/prometheus-sql) for single-tenant database.
- MySQL: [prometheus-mysql-exporter](https://github.com/braedon/prometheus-mysql-exporter) for multi-tenant database with consistent structure.

