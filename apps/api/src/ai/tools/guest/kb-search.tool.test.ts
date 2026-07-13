import { describe, it, expect, vi } from 'vitest';
import { KbSearchTool } from './kb-search.tool.js';
import type { KbService } from '../../../kb/kb.service.js';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema.js';
import type { ToolContext } from '../agent-tool.js';

const guestCtx: ToolContext = { actor: 'guest', conversationId: 'c1', tenantId: 't1' };
const staffCtx: ToolContext = { actor: 'staff', conversationId: 'c1', tenantId: 't1', permissions: [] };

const hit = (baseId: string, title: string) => ({
  id: `p-${title}`,
  baseId,
  title,
  shortId: 's',
  snippet: `<mark>${title}</mark> подробности`,
  rank: 1,
});

function makeTool(searchResult: unknown[], guestBaseIds: string[]) {
  const kb = {
    search: vi.fn().mockResolvedValue(searchResult),
    filterGuestVisible: vi.fn().mockResolvedValue([]),
    hasGuestVisiblePages: vi.fn().mockResolvedValue(false),
  } as unknown as KbService;
  const config = { get: vi.fn().mockReturnValue(guestBaseIds) } as unknown as ConfigService<Env, true>;
  return { tool: new KbSearchTool(kb, config), kb };
}

describe('KbSearchTool', () => {
  it('сотрудник ищет по всей базе, сниппеты без <mark>', async () => {
    const { tool } = makeTool([hit('b1', 'Поздний выезд')], []);
    const res = await tool.execute({ query: 'поздний выезд' }, staffCtx);
    expect(res.content).toContain('Поздний выезд');
    expect(res.content).not.toContain('<mark>');
  });

  it('гостю без настроенных баз KB выключен (без утечки)', async () => {
    const { tool, kb } = makeTool([hit('b1', 'Внутренний регламент')], []);
    const res = await tool.execute({ query: 'регламент' }, guestCtx);
    expect(res.content).toContain('не настроена');
    // поиск мог быть вызван, но внутренние страницы гостю не показаны
    expect(res.content).not.toContain('Внутренний регламент');
    expect(kb.search).toHaveBeenCalled();
  });

  it('гостю показываем только разрешённые базы', async () => {
    const { tool } = makeTool([hit('b1', 'Правила заезда'), hit('bX', 'Внутреннее')], ['b1']);
    const res = await tool.execute({ query: 'заезд' }, guestCtx);
    expect(res.content).toContain('Правила заезда');
    expect(res.content).not.toContain('Внутреннее');
  });
});
