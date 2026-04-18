Containerize with Docker.

- Use multi-stage builds to minimize image size
- Pin base image versions (e.g., node:20-alpine, not node:latest)
- Copy package.json and lockfile first to leverage layer caching
- Use .dockerignore to exclude node_modules, .git, and build artifacts
- Set non-root USER for security
- Use HEALTHCHECK for production containers
- Prefer docker compose for multi-service local development
