# Инфраструктура

## Локальная разработка

```bash
docker compose -f infra/docker-compose.yml up -d
```

Поднимает PostgreSQL (5432), Redis (6379) и MinIO (S3, 9000 / консоль 9001).
Значения `DATABASE_URL`, `REDIS_URL`, `S3_*` для локали — в `apps/api/.env.example`.

После старта БД применить миграции:

```bash
corepack pnpm --filter @dha/api prisma:migrate
```

## Прод (Yandex Cloud, РФ / 152-ФЗ)

`infra/terraform` — managed PostgreSQL, Redis и Object Storage (бакет для сканов
документов, приватный + версионирование). Это **скелет**: пресеты ресурсов, сеть и
lifecycle-правила хранения ПДн уточняются перед `apply`.

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # заполнить
terraform init && terraform plan
```

## Docker-образ backend

```bash
docker build -f infra/docker/api.Dockerfile -t dha-api .
```
