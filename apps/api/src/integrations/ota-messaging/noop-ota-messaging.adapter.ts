import { Injectable, Logger } from '@nestjs/common';
import { OtaMessagingPort, type OtaMessageParams } from './ota-messaging.port.js';

/** Заглушка OTA-messaging: логирует и честно отвечает «не отправлено» (§16.3 открыт). */
@Injectable()
export class NoopOtaMessagingAdapter extends OtaMessagingPort {
  private readonly logger = new Logger(NoopOtaMessagingAdapter.name);

  async send(params: OtaMessageParams): Promise<boolean> {
    this.logger.log(
      `OTA-messaging (noop): бронь ${params.bookingId.slice(0, 8)}, источник ${params.sourceName ?? '—'}: ${params.text.slice(0, 80)}…`,
    );
    return false; // канал недоступен — оркестратор идёт по фолбэку (sms/email)
  }
}
