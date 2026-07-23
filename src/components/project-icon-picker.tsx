import { PROJECT_ICONS, PROJECT_ICON_KEYS, type ProjectIconKey } from "@/lib/project-icons";
import { cn } from "@/lib/utils";

export function ProjectIconPicker({
  value,
  onChange,
}: {
  value: ProjectIconKey;
  onChange: (value: ProjectIconKey) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
      {PROJECT_ICON_KEYS.map((key) => {
        const { icon: Icon, label } = PROJECT_ICONS[key];
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={selected}
            onClick={() => onChange(key)}
            className={cn(
              "flex aspect-square items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              selected && "border-foreground/30 bg-muted text-foreground ring-2 ring-ring/30"
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
