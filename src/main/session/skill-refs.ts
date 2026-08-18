/** Skills named inside a sentence.
 *
 *  pi expands `/skill:name` only when it is the whole message —
 *  `_expandSkillCommand` starts with `text.startsWith("/skill:")` and takes one
 *  skill. That is the right rule for a command line, and the wrong one for a
 *  composer: naming two skills in one sentence is exactly what the picker is
 *  for, and neither of them is at position 0.
 *
 *  So this does the same expansion, everywhere in the text. The block it builds
 *  is pi's own, character for character, because the model has been taught to
 *  read that shape and a second shape would be a second thing to learn. */

import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** A skill as pi's loader reports one. Read structurally: the fields are
 *  stable, the class around them is not worth importing a type for. */
interface LoadedSkill {
  name: string
  filePath: string
  baseDir?: string
}

/** `/skill:name` at the start or after whitespace. The same rule the composer
 *  uses to open the picker, so what is offered and what is expanded agree. */
const REFERENCE = /(^|\s)\/skill:([A-Za-z0-9._-]+)/g

function frontmatterStripped(content: string): string {
  if (!content.startsWith('---')) return content
  const end = content.indexOf('\n---', 3)
  return end === -1 ? content : content.slice(content.indexOf('\n', end + 1) + 1)
}

function skillsOf(session: unknown): LoadedSkill[] {
  const loader = (session as { resourceLoader?: Record<string, unknown> } | undefined)
    ?.resourceLoader
  const get = loader?.getSkills
  if (typeof get !== 'function') return []

  try {
    const answer = (get as () => { skills?: LoadedSkill[] }).call(loader)
    return answer.skills ?? []
  } catch {
    return []
  }
}

/** Replaces every `/skill:name` in the text with the skill itself.
 *
 *  A name nothing answers to is left exactly as it was — the reader wrote it,
 *  and swallowing it would lose what they typed. A file that cannot be read is
 *  left the same way: the turn is still worth running. */
export function expandSkillRefs(session: unknown, text: string): string {
  if (!text.includes('/skill:')) return text

  const skills = skillsOf(session)
  if (skills.length === 0) return text

  return text.replace(REFERENCE, (whole, lead: string, name: string) => {
    const skill = skills.find((one) => one.name === name)
    if (!skill) return whole

    try {
      const body = frontmatterStripped(readFileSync(skill.filePath, 'utf8')).trim()
      const base = skill.baseDir ?? dirname(skill.filePath)
      return `${lead}<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${base}.\n\n${body}\n</skill>`
    } catch {
      return whole
    }
  })
}
