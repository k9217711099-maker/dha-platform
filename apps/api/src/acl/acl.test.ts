import { describe, expect, it } from 'vitest';
import { AclLevel, type AclEntry } from '@prisma/client';
import { allows, resolveChain, subjectKey } from './acl.service.js';

const entry = (subjectType: string, subjectId: string, level: AclLevel): AclEntry =>
  ({ id: 'x', tenantId: 't', resourceType: 'kb_page', resourceId: 'r', subjectType, subjectId, level, createdAt: new Date() }) as AclEntry;

const subj = (...keys: string[]) => new Set(keys);

describe('acl/resolveChain — «ближайший узел с грантами решает»', () => {
  it('без грантов по всей цепочке → default (действует только RBAC)', () => {
    expect(resolveChain([[], [], []], subj('user:u1'))).toBe('default');
  });

  it('гранты на узле: совпал субъект → уровень, не совпал → отказ', () => {
    const chain = [[entry('role', 'spir_head', AclLevel.VIEWER)]];
    expect(resolveChain(chain, subj('role:spir_head'))).toBe(AclLevel.VIEWER);
    expect(resolveChain(chain, subj('role:manager'))).toBeNull();
  });

  it('ближний узел перекрывает дальний (ограничение внутри открытой базы)', () => {
    const chain = [
      [entry('user', 'boss', AclLevel.MANAGER)], // сама страница — только boss
      [entry('role', 'spir_head', AclLevel.EDITOR)], // база — для СПиР
    ];
    expect(resolveChain(chain, subj('role:spir_head'))).toBeNull(); // до базы не доходим
    expect(resolveChain(chain, subj('user:boss'))).toBe(AclLevel.MANAGER);
  });

  it('узлы без грантов прозрачны: наследуем от родителя', () => {
    const chain = [[], [entry('group', 'g1', AclLevel.EDITOR)]];
    expect(resolveChain(chain, subj('group:g1'))).toBe(AclLevel.EDITOR);
    expect(resolveChain(chain, subj('group:g2'))).toBeNull();
  });

  it('из нескольких совпавших грантов берётся максимальный уровень', () => {
    const chain = [[entry('role', 'r1', AclLevel.VIEWER), entry('user', 'u1', AclLevel.MANAGER)]];
    expect(resolveChain(chain, subj('role:r1', 'user:u1'))).toBe(AclLevel.MANAGER);
  });
});

describe('acl/allows', () => {
  it('default разрешает всё (решает RBAC), null запрещает всё', () => {
    expect(allows('default', AclLevel.MANAGER)).toBe(true);
    expect(allows(null, AclLevel.VIEWER)).toBe(false);
  });
  it('уровни вложены: manager ⊃ editor ⊃ viewer', () => {
    expect(allows(AclLevel.EDITOR, AclLevel.VIEWER)).toBe(true);
    expect(allows(AclLevel.VIEWER, AclLevel.EDITOR)).toBe(false);
    expect(allows(AclLevel.MANAGER, AclLevel.EDITOR)).toBe(true);
  });
});

describe('acl/subjectKey', () => {
  it('формат type:id', () => {
    expect(subjectKey('user', 'abc')).toBe('user:abc');
  });
});
