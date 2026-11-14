import { z } from 'zod'
import { isValidTimeZone } from './day.ts'

export const settingsSchema = z.object({
  /** New words introduced per day. */
  newPerDay: z.int().min(0).max(100),
  /** Where the study day starts and ends. */
  timezone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
  /** Default audio speed. */
  playbackRate: z.number().min(0.5).max(1.5),
})
export type Settings = z.infer<typeof settingsSchema>

export const settingsPatchSchema = settingsSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Nothing to change')
export type SettingsPatch = z.infer<typeof settingsPatchSchema>
