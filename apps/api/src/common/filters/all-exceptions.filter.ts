import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/** Единый формат ответа об ошибке для всех клиентов. */
interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  /** Машинный код ошибки, если исключение его несёт (напр. ограничения Rate Engine: min_stay_failed, stop_sell_active). */
  code?: string;
  path: string;
  timestamp: string;
}

/**
 * Глобальный фильтр: приводит любую ошибку к единому JSON-формату и логирует.
 * Внутренние детали 5xx наружу не отдаём.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Внутренняя ошибка сервера';
    let error = 'Internal Server Error';
    let code: string | undefined;
    if (isHttp) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        message = (r.message as string) ?? message;
        error = (r.error as string) ?? exception.name;
        if (typeof r.code === 'string') code = r.code;
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponse = {
      statusCode: status,
      message,
      error,
      ...(code ? { code } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(status).json(body);
  }
}
