import { describe, it, expect } from "vitest";
import {
  loginSchema,
  signupSchema,
  approveUserSchema,
  changeUserRoleSchema,
  APP_ROLES,
} from "@/lib/validation/auth";

describe("loginSchema", () => {
  it("accepts a valid login", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.co", password: "longenough" }).success
    ).toBe(true);
  });
  it("rejects bad email and empty password", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("signupSchema", () => {
  it("requires name and a 12+ char password", () => {
    expect(
      signupSchema.safeParse({
        fullName: "Mari Mets",
        email: "mari@example.com",
        password: "a-long-password",
      }).success
    ).toBe(true);
    expect(
      signupSchema.safeParse({
        fullName: "M",
        email: "mari@example.com",
        password: "short",
      }).success
    ).toBe(false);
  });
});

describe("approveUserSchema", () => {
  it("requires uuid + known role", () => {
    expect(
      approveUserSchema.safeParse({
        userId: "11111111-1111-4111-8111-111111111111",
        role: "project_manager",
      }).success
    ).toBe(true);
    expect(
      approveUserSchema.safeParse({ userId: "not-a-uuid", role: "admin" }).success
    ).toBe(false);
    expect(
      approveUserSchema.safeParse({
        userId: "11111111-1111-4111-8111-111111111111",
        role: "superuser",
      }).success
    ).toBe(false);
    expect(
      approveUserSchema.safeParse({
        userId: "11111111-1111-4111-8111-111111111111".toUpperCase(),
        role: "member",
      }).success
    ).toBe(true);
  });
  it("exposes the five v1 roles", () => {
    expect(APP_ROLES).toEqual([
      "admin",
      "project_manager",
      "finance",
      "member",
      "viewer",
    ]);
  });
});

describe("changeUserRoleSchema", () => {
  it("requires uuid + known role, same as approveUserSchema", () => {
    expect(
      changeUserRoleSchema.safeParse({
        userId: "11111111-1111-4111-8111-111111111111",
        role: "finance",
      }).success
    ).toBe(true);
    expect(
      changeUserRoleSchema.safeParse({ userId: "not-a-uuid", role: "admin" }).success
    ).toBe(false);
    expect(
      changeUserRoleSchema.safeParse({
        userId: "11111111-1111-4111-8111-111111111111",
        role: "superuser",
      }).success
    ).toBe(false);
  });
});
