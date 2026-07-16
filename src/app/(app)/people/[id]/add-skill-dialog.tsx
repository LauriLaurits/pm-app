"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { AddSkillForm } from "./add-skill-form";
import type { SkillOption } from "./types";

export function AddSkillDialog({
  personId,
  allSkills,
  existingSkillIds,
}: {
  personId: string;
  allSkills: SkillOption[];
  existingSkillIds: string[];
}) {
  const [open, setOpen] = useState(false);
  // Already-linked skills are excluded from the picker -- re-adding one is a level edit via
  // SkillRow's inline select, not this "add" flow.
  const available = allSkills.filter((s) => !existingSkillIds.includes(s.id));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Add skill</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add skill</DialogTitle>
          <DialogDescription>Pick an existing skill, or add a new one.</DialogDescription>
        </DialogHeader>
        <AddSkillForm personId={personId} availableSkills={available} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
