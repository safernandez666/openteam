Build with Next.js App Router.

- Use Server Components by default, add 'use client' only when needed
- Place pages in app/ directory following the file-based routing convention
- Use Server Actions for mutations instead of API routes when possible
- Implement loading.tsx and error.tsx for each route segment
- Use `generateMetadata` for SEO
- Prefer `fetch` with `next: { revalidate }` for data fetching
- Static pages by default — use dynamic rendering only when required
