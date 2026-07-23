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
  PERSON_AVATAR_PRESETS,
  isPersonAvatarPreset,
  type PersonAvatarPreset,
} from "@/lib/person-avatar-presets";
import { cn } from "@/lib/utils";

const PRESETS: Record<PersonAvatarPreset, { label: string; icon: LucideIcon }> = {
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
  const Icon = preset ? PRESETS[preset].icon : null;

  return (
    <Avatar className={className}>
      {!preset && <AvatarImage src={avatarUrl ?? undefined} alt={name ?? ""} />}
      <AvatarFallback className={avatarTint(name)}>
        {Icon ? <Icon className="size-1/2" /> : initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function PersonAvatarPicker({
  value,
  onChange,
  photoUrl,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The person's existing photo URL, when they have one -- rendered as a leading tile so
   * editing keeps the photo selectable instead of forcing a preset over it. */
  photoUrl?: string | null;
}) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {photoUrl && (
        <button
          type="button"
          title="Current photo"
          aria-label="Current photo"
          aria-pressed={value === photoUrl}
          onClick={() => onChange(photoUrl)}
          className={cn(
            "flex aspect-square items-center justify-center overflow-hidden rounded-full border bg-muted/40 transition-colors",
            value === photoUrl && "border-foreground/30 ring-2 ring-ring/30"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="" className="size-full object-cover" />
        </button>
      )}
      {PERSON_AVATAR_PRESETS.map((preset) => {
        const { icon: Icon, label } = PRESETS[preset];
        const selected = value === preset;
        return (
          <button
            key={preset}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={selected}
            onClick={() => onChange(preset)}
            className={cn(
              "flex aspect-square items-center justify-center rounded-full border bg-muted/40 text-muted-foreground transition-colors hover:text-foreground",
              selected && "border-foreground/30 bg-muted text-foreground ring-2 ring-ring/30"
            )}
          >
            <Icon className="size-5" />
          </button>
        );
      })}
    </div>
  );
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "");
}
