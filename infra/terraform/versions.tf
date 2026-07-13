terraform {
  required_version = ">= 1.6"
  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = ">= 0.120"
    }
  }
  # Рекомендуется хранить стейт в Yandex Object Storage (backend "s3").
  # Настраивается отдельно после создания бакета для стейта.
}

provider "yandex" {
  cloud_id  = var.cloud_id
  folder_id = var.folder_id
  zone      = var.zone
}
