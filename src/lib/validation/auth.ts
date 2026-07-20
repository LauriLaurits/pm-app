import { z } from "zod";

export const APP_ROLES = [
  "admin",
  "project_manager",
  "finance",
  "member",
  "viewer",
] as const;

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  fullName: z.string().min(2, "Enter your full name").max(120),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(12, "Password must be at least 12 characters").max(128),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const approveUserSchema = z.object({
  userId: z.uuid(),
  role: z.enum(APP_ROLES),
});
export type ApproveUserInput = z.infer<typeof approveUserSchema>;

/** Re-roling an already-active user (users-table inline role edit) -- same shape as
 * approveUserSchema, kept separate since approval and re-roling are different actions with
 * different side effects (approval also flips status + sends a notification). */
export const changeUserRoleSchema = z.object({
  userId: z.uuid(),
  role: z.enum(APP_ROLES),
});
export type ChangeUserRoleInput = z.infer<typeof changeUserRoleSchema>;
