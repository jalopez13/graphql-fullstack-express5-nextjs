# GraphQL Server and Client

A GraphQL Server and Client with a full-stack setup.

## Apps

| App         | Stack                                         | Directory                |
| ----------- | --------------------------------------------- | ------------------------ |
| **Backend** | Express 5, Apollo Server 4, PostgreSQL, Redis | [`backend/`](./backend/) |

## Infrastructure

Shared services are managed via Docker Compose at the repo root.

| Service    | Image                | Port   |
| ---------- | -------------------- | ------ |
| PostgreSQL | `postgres:16-alpine` | `5432` |
| Redis      | `redis:7-alpine`     | `6379` |

### Start services

```sh
docker compose up -d
```

### Stop services

```sh
docker compose down
```

### Reset data

```sh
docker compose down -v
docker compose up -d
```

The `-v` flag removes named volumes (`pgdata`, `redisdata`), wiping all stored data.

### Check health

```sh
docker compose ps
```

Both services include health checks — status should show `(healthy)`.

## Getting Started

1. Start infrastructure: `docker compose up -d`
2. Follow the setup guide in each app's README:
   - [Backend](./backend/README.md)
