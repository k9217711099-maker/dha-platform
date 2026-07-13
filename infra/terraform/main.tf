# Инфраструктура D H&A в Yandex Cloud (РФ, 152-ФЗ).
# СКЕЛЕТ: значения сети/ресурсов уточнить под тариф и нагрузку перед apply.

locals {
  prefix = "dha-${var.environment}"
}

# --- Сеть ---
resource "yandex_vpc_network" "main" {
  name = "${local.prefix}-net"
}

resource "yandex_vpc_subnet" "main" {
  name           = "${local.prefix}-subnet"
  zone           = var.zone
  network_id     = yandex_vpc_network.main.id
  v4_cidr_blocks = ["10.10.0.0/24"]
}

# --- PostgreSQL (managed) ---
resource "yandex_mdb_postgresql_cluster" "main" {
  name        = "${local.prefix}-pg"
  environment = var.environment == "prod" ? "PRODUCTION" : "PRESTABLE"
  network_id  = yandex_vpc_network.main.id

  config {
    version = "16"
    resources {
      resource_preset_id = "s2.micro"
      disk_type_id       = "network-ssd"
      disk_size          = var.pg_disk_size
    }
  }

  host {
    zone      = var.zone
    subnet_id = yandex_vpc_subnet.main.id
  }
}

resource "yandex_mdb_postgresql_database" "dha" {
  cluster_id = yandex_mdb_postgresql_cluster.main.id
  name       = "dha"
  owner      = yandex_mdb_postgresql_user.dha.name
}

resource "yandex_mdb_postgresql_user" "dha" {
  cluster_id = yandex_mdb_postgresql_cluster.main.id
  name       = "dha"
  password   = var.pg_password
}

# --- Redis (managed) ---
resource "yandex_mdb_redis_cluster" "main" {
  name        = "${local.prefix}-redis"
  environment = var.environment == "prod" ? "PRODUCTION" : "PRESTABLE"
  network_id  = yandex_vpc_network.main.id

  config {
    version = "7.2"
  }

  resources {
    resource_preset_id = "hm1.nano"
    disk_size          = 16
    disk_type_id       = "network-ssd"
  }

  host {
    zone      = var.zone
    subnet_id = yandex_vpc_subnet.main.id
  }
}

# --- Сервисный аккаунт и ключ для Object Storage ---
resource "yandex_iam_service_account" "storage" {
  name = "${local.prefix}-storage-sa"
}

resource "yandex_resourcemanager_folder_iam_member" "storage_editor" {
  folder_id = var.folder_id
  role      = "storage.editor"
  member    = "serviceAccount:${yandex_iam_service_account.storage.id}"
}

resource "yandex_iam_service_account_static_access_key" "storage" {
  service_account_id = yandex_iam_service_account.storage.id
}

# --- Object Storage: бакет для сканов документов (152-ФЗ) ---
# Приватный доступ, версионирование; шифрование на стороне приложения.
resource "yandex_storage_bucket" "documents" {
  access_key = yandex_iam_service_account_static_access_key.storage.access_key
  secret_key = yandex_iam_service_account_static_access_key.storage.secret_key
  bucket     = "${local.prefix}-documents"
  acl        = "private"

  versioning {
    enabled = true
  }

  # TODO: задать lifecycle-правила удаления по регламенту хранения ПДн (§18.2).
}
