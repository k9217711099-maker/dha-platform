variable "cloud_id" {
  type        = string
  description = "Yandex Cloud ID"
}

variable "folder_id" {
  type        = string
  description = "Yandex Cloud folder ID"
}

variable "zone" {
  type        = string
  description = "Зона размещения (РФ, 152-ФЗ)"
  default     = "ru-central1-a"
}

variable "environment" {
  type        = string
  description = "Окружение: dev | stage | prod"
  default     = "dev"
}

variable "pg_password" {
  type        = string
  description = "Пароль пользователя БД"
  sensitive   = true
}

variable "pg_disk_size" {
  type        = number
  description = "Размер диска PostgreSQL, ГБ"
  default     = 20
}
