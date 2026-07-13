import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { BookingEngineModule } from '../../booking-engine/booking-engine.module.js';
import { KbModule } from '../../kb/kb.module.js';
import { ToolRegistry } from './tool-registry.js';
import { CopilotToolRegistry } from './copilot-tool-registry.js';
import { KbSearchTool } from './guest/kb-search.tool.js';
import { EscalateTool } from './guest/escalate.tool.js';
import { SearchOffersTool } from './guest/search-offers.tool.js';
import { QuoteOfferTool } from './guest/quote-offer.tool.js';
import { CreateBookingTool } from './guest/create-booking.tool.js';
import { FindBookingTool } from './staff/find-booking.tool.js';
import { AddBookingNoteTool } from './staff/add-booking-note.tool.js';
import { KbDraftPageTool } from './staff/kb-draft-page.tool.js';

/**
 * Инструменты агентов + два реестра (разные DI-токены):
 *  - ToolRegistry        — гостевой агент (без RBAC);
 *  - CopilotToolRegistry — копилот сотрудника (RBAC-гейтинг по правам роли).
 * Реестры собираются фабриками (конструктор принимает массив инструментов).
 * KbModule даёт KbService для kb_search (переиспользуем готовую базу знаний).
 */
@Module({
  imports: [ConversationsModule, BookingEngineModule, KbModule],
  providers: [
    KbSearchTool,
    EscalateTool,
    SearchOffersTool,
    QuoteOfferTool,
    CreateBookingTool,
    FindBookingTool,
    AddBookingNoteTool,
    KbDraftPageTool,
    {
      provide: ToolRegistry,
      inject: [KbSearchTool, EscalateTool, SearchOffersTool, QuoteOfferTool, CreateBookingTool],
      useFactory: (
        kb: KbSearchTool,
        escalate: EscalateTool,
        search: SearchOffersTool,
        quote: QuoteOfferTool,
        create: CreateBookingTool,
      ) => new ToolRegistry([kb, search, quote, create, escalate]),
    },
    {
      provide: CopilotToolRegistry,
      inject: [KbSearchTool, FindBookingTool, AddBookingNoteTool, KbDraftPageTool],
      useFactory: (kb: KbSearchTool, find: FindBookingTool, addNote: AddBookingNoteTool, kbDraft: KbDraftPageTool) =>
        new CopilotToolRegistry([kb, find, addNote, kbDraft]),
    },
  ],
  exports: [ToolRegistry, CopilotToolRegistry],
})
export class ToolsModule {}
