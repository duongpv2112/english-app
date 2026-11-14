import type { StudyWord, WordPatch } from '@english-app/shared'
import type { PrismaClient } from '../db.ts'
import { AppError } from '../plugins/errorHandler.ts'
import { toStudyWord } from './studyQueue.ts'

/**
 * Applies a correction to a word's card content. A changed example sentence loses its audio,
 * which no longer matches it; the importer's `tts` step records it again on its next run.
 */
export async function updateWord(
  db: PrismaClient,
  wordId: string,
  patch: WordPatch,
  audioBaseUrl: string | null,
): Promise<StudyWord> {
  return db.$transaction(async (tx) => {
    const word = await tx.word.findUnique({ where: { id: wordId }, include: { examples: true } })
    if (!word) throw new AppError('NOT_FOUND', 404, 'Word not found')

    const current = new Map(word.examples.map((e) => [e.id, e]))
    for (const example of patch.examples ?? []) {
      if (!current.has(example.id)) {
        throw new AppError('VALIDATION_ERROR', 400, 'Example does not belong to this word')
      }
    }

    await tx.word.update({
      where: { id: wordId },
      data: { pos: patch.pos, ipa: patch.ipa, meaningVi: patch.meaningVi },
    })
    for (const example of patch.examples ?? []) {
      const textChanged =
        example.textEn !== undefined && example.textEn !== current.get(example.id)!.textEn
      await tx.example.update({
        where: { id: example.id },
        data: {
          textEn: example.textEn,
          textVi: example.textVi,
          ...(textChanged ? { audioKey: null, voice: null } : {}),
        },
      })
    }

    const updated = await tx.word.findUniqueOrThrow({
      where: { id: wordId },
      include: { examples: { orderBy: { id: 'asc' } } },
    })
    return toStudyWord(updated, audioBaseUrl)
  })
}
