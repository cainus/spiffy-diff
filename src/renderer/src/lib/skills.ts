import { useCallback, useState } from 'react'

/** A saved prompt. A skill button sends the prompt to the agent. */
export interface Skill {
  id: string
  name: string
  prompt: string
}

const KEY = 'spiffy.skills'

function isSkill(v: unknown): v is Skill {
  const s = v as Partial<Skill> | null
  return typeof s?.id === 'string' && typeof s.name === 'string' && typeof s.prompt === 'string'
}

function loadSkills(): Skill[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isSkill) : []
  } catch {
    return []
  }
}

/** Skills are shared by all sources. They persist in localStorage. */
export function useSkills() {
  const [skills, setSkills] = useState(loadSkills)

  const commit = useCallback((next: Skill[]) => {
    localStorage.setItem(KEY, JSON.stringify(next))
    setSkills(next)
  }, [])

  return {
    skills,
    /** Replace the skill with the same id, or add a new one. */
    save: (skill: Skill) =>
      commit(
        skills.some((s) => s.id === skill.id)
          ? skills.map((s) => (s.id === skill.id ? skill : s))
          : [...skills, skill],
      ),
    remove: (id: string) => commit(skills.filter((s) => s.id !== id)),
  }
}
