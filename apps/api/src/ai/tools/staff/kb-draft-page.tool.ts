import { Injectable } from '@nestjs/common';
import { KbPageStatus } from '@prisma/client';
import { AgentTool, type ToolContext, type ToolResult } from '../agent-tool.js';
import { asString } from '../tool-args.util.js';
import { KbService } from '../../../kb/kb.service.js';
import { plainTextToContent } from '../../../kb/content.js';
import type { AclActor } from '../../../acl/acl.service.js';

/**
 * Быстрое внесение информации в Базу знаний через копилота (KB-DRIVE-TZ.md §3.5).
 * Инструмент создаёт ЧЕРНОВИК (status=DRAFT, aiAssisted) — публикует всегда человек.
 * mutates=true → копилот не выполняет его сам: сотрудник подтверждает действие,
 * и только потом создаётся черновик («готовит — сотрудник подтверждает»).
 * ACL действуют от имени сотрудника: куда нет права редактирования — не запишет.
 */
@Injectable()
export class KbDraftPageTool extends AgentTool {
  readonly name = 'kb_draft_page';
  readonly description =
    'Создать ЧЕРНОВИК страницы в базе знаний из подготовленного текста. Перед вызовом поищи похожие страницы через kb_search и скажи сотруднику, если тема уже описана. Публикует черновик сотрудник вручную. Форматирование текста: "# " — заголовок, "## " — подзаголовок, "- " — пункт списка, пустая строка — новый абзац, "---" — разделитель.';
  override readonly requiredPermission = 'kb_edit';
  override readonly mutates = true;
  readonly parameters = {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Заголовок страницы' },
      content: { type: 'string', description: 'Текст страницы (см. форматирование в описании инструмента)' },
      baseName: { type: 'string', description: 'Название базы знаний (не обязательно — возьмётся первая доступная)' },
      parentTitle: { type: 'string', description: 'Заголовок родительской страницы/раздела (не обязательно)' },
    },
    required: ['title', 'content'],
    additionalProperties: false,
  };

  constructor(private readonly kb: KbService) {
    super();
  }

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const title = asString(args.title)?.trim();
    const content = asString(args.content);
    if (!title || !content?.trim()) return { content: 'Нужны заголовок и текст страницы.', isError: true };
    if (!ctx.employeeId) return { content: 'Инструмент доступен только сотрудникам.', isError: true };
    // roleKey в контексте копилота нет: гранты «на роль» для агента не резолвятся,
    // личные и групповые — работают. Это строже, а не слабее ручного режима.
    const actor: AclActor = { adminId: ctx.employeeId, roleKey: null, perms: ctx.permissions ?? [] };

    const bases = await this.kb.listBases(ctx.tenantId, actor);
    if (bases.length === 0) return { content: 'Нет доступных баз знаний.', isError: true };
    const baseName = asString(args.baseName)?.trim().toLowerCase();
    const base = (baseName && bases.find((b) => b.name.toLowerCase().includes(baseName))) || bases[0]!;

    let parentId: string | null = null;
    const parentTitle = asString(args.parentTitle)?.trim().toLowerCase();
    if (parentTitle) {
      const pages = await this.kb.pagesOfBase(ctx.tenantId, base.id, actor);
      parentId = pages.find((p) => p.title.toLowerCase().includes(parentTitle))?.id ?? null;
    }

    // Дедуп: похожие страницы показываем сотруднику вместе с результатом (§3.5)
    const similar = (await this.kb.search(ctx.tenantId, title, actor)).slice(0, 3);

    try {
      const page = await this.kb.createPage(
        ctx.tenantId,
        { baseId: base.id, parentId, title, content: plainTextToContent(content), status: KbPageStatus.DRAFT, aiAssisted: true },
        ctx.employeeId,
        actor,
      );
      const similarNote =
        similar.length > 0 ? ` Похожие страницы (проверьте, нет ли дубля): ${similar.map((s) => `«${s.title}»`).join(', ')}.` : '';
      return {
        content: `Черновик «${page.title}» создан в базе «${base.name}»${parentId ? ' внутри указанного раздела' : ''}. Сотруднику нужно открыть его в разделе «База знаний», проверить и опубликовать.${similarNote}`,
        data: { pageId: page.id, shortId: page.shortId, url: `/kb?p=${page.shortId}` },
      };
    } catch (e) {
      return { content: `Не удалось создать черновик: ${(e as Error).message}`, isError: true };
    }
  }
}
