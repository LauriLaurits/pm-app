import Link from "next/link";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>
          An administrator must approve your account before you get access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SignupForm />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
