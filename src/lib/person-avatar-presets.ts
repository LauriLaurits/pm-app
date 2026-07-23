export const PERSON_AVATAR_PRESETS = [
  "preset:user",
  "preset:briefcase",
  "preset:code",
  "preset:design",
  "preset:analytics",
  "preset:communication",
] as const;

export type PersonAvatarPreset = (typeof PERSON_AVATAR_PRESETS)[number];
export const DEFAULT_PERSON_AVATAR: PersonAvatarPreset = "preset:user";

export function isPersonAvatarPreset(value: string | null | undefined): value is PersonAvatarPreset {
  return PERSON_AVATAR_PRESETS.includes(value as PersonAvatarPreset);
}
