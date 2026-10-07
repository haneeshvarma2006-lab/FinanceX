'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/current-user';
import type { FormState } from '@/lib/result';
import * as rulesRepo from '@/modules/rules/repository';
import { RULE_TEMPLATES, isRuleTemplateKey } from '@/modules/review/analysis';

export type { FormState };

/**
 * Adopt the rule a weekly review suggested.
 *
 * Only the template's key comes from the form; the rule itself is built from
 * the server's own catalogue, so a crafted request cannot plant an arbitrary
 * trigger or action. Adopting twice switches the existing rule back on rather
 * than creating a duplicate.
 */
export async function adoptRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const key = String(formData.get('template') ?? '');
  if (!isRuleTemplateKey(key))
    return { message: 'That suggestion no longer exists.', tone: 'error' };

  const template = RULE_TEMPLATES[key];
  const existing = (await rulesRepo.listRules(user.id)).find((r) => r.name === template.name);

  if (existing) {
    if (!existing.enabled) await rulesRepo.setRuleEnabled(user.id, existing.id, true);
  } else {
    await rulesRepo.insertRule(user.id, {
      name: template.name,
      triggerType: template.triggerType,
      triggerConfig: { ...template.triggerConfig },
      actionType: template.actionType,
      actionConfig: { ...template.actionConfig },
    });
  }

  revalidatePath('/review');
  revalidatePath('/rules');
  return { message: `Rule on: ${template.name}`, tone: 'success' };
}
