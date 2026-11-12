// The saved templates the Send menu offers (GET/DELETE /api/templates).
import type { ComposeTemplate } from '~/types/compose/compose'
import { authFetch } from '~/utils/auth-client'
import { textToHtml } from '~/utils/compose/rich-text-utils'

export async function fetchTemplates(): Promise<ComposeTemplate[]> {
  try {
    const response = await authFetch('/api/templates', { cache: 'no-store' })
    if (!response.ok) return []
    return ((await response.json()) as { templates: ComposeTemplate[] }).templates
  } catch {
    return []
  }
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const response = await authFetch(`/api/templates/${id}`, { method: 'DELETE' })
  return response.ok
}

export function templateContent(template: ComposeTemplate): { title: string, html: string } {
  return { title: template.subject ?? '', html: template.htmlBody ?? textToHtml(template.textBody ?? '') }
}
