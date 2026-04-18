Use Prisma as the ORM.

- Run `npx prisma generate` after schema changes
- Use transactions for multi-step mutations: `prisma.$transaction()`
- Always select only the fields you need to avoid over-fetching
- Use `include` and `select` for relations
- Handle unique constraint errors (P2002) gracefully
- Write migrations with `npx prisma migrate dev --name descriptive_name`
