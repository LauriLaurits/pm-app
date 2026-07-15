"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LayoutListIcon, LayoutGridIcon } from "lucide-react";

export function ViewToggle({ view }: { view: "table" | "cards" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setView(groupValue: string[]) {
    const next = groupValue[0];
    if (!next) return; // ignore the toggle-off click; a view must stay selected
    const params = new URLSearchParams(searchParams.toString());
    if (next === "table") params.delete("view");
    else params.set("view", next);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <ToggleGroup
      value={[view]}
      onValueChange={setView}
      variant="outline"
      aria-label="Toggle table or card view"
    >
      <ToggleGroupItem value="table" aria-label="Table view">
        <LayoutListIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="cards" aria-label="Card view">
        <LayoutGridIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
