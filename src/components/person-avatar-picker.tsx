"use client";

import { useRef, useState } from "react";
import { CameraIcon, Loader2Icon } from "lucide-react";
import { uploadPersonAvatarAction } from "@/app/actions/avatars";
import { PERSON_AVATAR_PRESET_META } from "@/components/person-avatar";
import { PERSON_AVATAR_PRESETS, isPersonAvatarPreset } from "@/lib/person-avatar-presets";
import { cn } from "@/lib/utils";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const TILE_CLASS =
  "flex aspect-square items-center justify-center rounded-full border bg-muted/40 text-muted-foreground transition-colors hover:text-foreground";
const SELECTED_CLASS = "border-foreground/30 bg-muted text-foreground ring-2 ring-ring/30";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One photo tile: a freshly uploaded photo (value is a non-preset URL) wins over the
  // pre-existing one, so uploading inside the edit form previews the replacement.
  const photo = !isPersonAvatarPreset(value) ? value : (photoUrl ?? null);

  async function onFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Image must be under 2 MB.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      // Upload runs server-side (session cookies are httpOnly, so the browser Supabase
      // client has no session and would hit the avatars bucket's RLS policy as `anon`).
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadPersonAvatarAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onChange(result.url);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-8 gap-2">
        <button
          type="button"
          title="Upload photo"
          aria-label="Upload photo"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className={cn(TILE_CLASS, "disabled:opacity-50")}
        >
          {uploading ? <Loader2Icon className="size-5 animate-spin" /> : <CameraIcon className="size-5" />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
            e.target.value = ""; // allow re-picking the same file after an error
          }}
        />
        {photo && (
          <button
            type="button"
            title="Photo"
            aria-label="Photo"
            aria-pressed={value === photo}
            onClick={() => onChange(photo)}
            className={cn(TILE_CLASS, "overflow-hidden", value === photo && SELECTED_CLASS)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="size-full object-cover" />
          </button>
        )}
        {PERSON_AVATAR_PRESETS.map((preset) => {
          const { icon: Icon, label } = PERSON_AVATAR_PRESET_META[preset];
          const selected = value === preset;
          return (
            <button
              key={preset}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={selected}
              onClick={() => onChange(preset)}
              className={cn(TILE_CLASS, selected && SELECTED_CLASS)}
            >
              <Icon className="size-5" />
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
