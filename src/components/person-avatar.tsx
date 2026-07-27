import {
  BarChart3,
  BriefcaseBusiness,
  Code2,
  Megaphone,
  Palette,
  User,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarTint } from "@/lib/avatar-tint";
import {
  DEFAULT_PERSON_AVATAR,
  isPersonAvatarPreset,
  type PersonAvatarPreset,
} from "@/lib/person-avatar-presets";

export const PERSON_AVATAR_PRESET_META: Record<PersonAvatarPreset, { label: string; icon: LucideIcon }> = {
  "preset:user": { label: "Default", icon: User },
  "preset:briefcase": { label: "Business", icon: BriefcaseBusiness },
  "preset:code": { label: "Engineering", icon: Code2 },
  "preset:design": { label: "Design", icon: Palette },
  "preset:analytics": { label: "Analytics", icon: BarChart3 },
  "preset:communication": { label: "Communication", icon: Megaphone },
};

export function PersonAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string | null | undefined;
  avatarUrl: string | null | undefined;
  className?: string;
}) {
  const preset = isPersonAvatarPreset(avatarUrl)
    ? avatarUrl
    : avatarUrl
      ? null
      : DEFAULT_PERSON_AVATAR;
  const Icon = preset ? PERSON_AVATAR_PRESET_META[preset].icon : null;

  return (
    <Avatar className={className}>
      {!preset && <AvatarImage src={avatarUrl ?? undefined} alt={name ?? ""} />}
      <AvatarFallback className={avatarTint(name)}>
        {Icon ? <Icon className="size-1/2" /> : initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "");
}
