Work with PostgreSQL databases.

- Write migrations as idempotent SQL (IF NOT EXISTS, IF EXISTS)
- Use indexes on foreign keys and frequently queried columns
- Prefer JSONB over JSON for queryable JSON data
- Use CTEs (WITH clauses) for readability in complex queries
- Always use parameterized queries to prevent SQL injection
- Use EXPLAIN ANALYZE to verify query performance on large tables
- Set appropriate column constraints (NOT NULL, UNIQUE, CHECK)
