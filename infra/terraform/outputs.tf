output "postgres_cluster_id" {
  value       = yandex_mdb_postgresql_cluster.main.id
  description = "ID кластера PostgreSQL"
}

output "redis_cluster_id" {
  value       = yandex_mdb_redis_cluster.main.id
  description = "ID кластера Redis"
}

output "documents_bucket" {
  value       = yandex_storage_bucket.documents.bucket
  description = "Бакет для сканов документов"
}

output "storage_access_key" {
  value       = yandex_iam_service_account_static_access_key.storage.access_key
  description = "Access key сервисного аккаунта Object Storage"
  sensitive   = true
}

output "storage_secret_key" {
  value       = yandex_iam_service_account_static_access_key.storage.secret_key
  description = "Secret key сервисного аккаунта Object Storage"
  sensitive   = true
}
