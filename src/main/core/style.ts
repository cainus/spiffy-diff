/**
 * All technical text that spiffy shows is in ASD-STE100 Simplified Technical English.
 * The summary prompt and the agent prompt both use these rules.
 */
export const STE_RULES = `Write all text in ASD-STE100 Simplified Technical English:
- Use only approved simple words. Use one word for one meaning. Do not use synonyms.
- Write short sentences: at most 20 words in a procedure, at most 25 words in a description.
- Write one idea in each sentence.
- Use the active voice and the present tense.
- Use technical names (file names, function names, code) as they are.
- Do not use idioms, metaphors, or slang.`
