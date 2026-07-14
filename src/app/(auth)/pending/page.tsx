import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/actions/auth";

export default function PendingPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Waiting for approval</CardTitle>
        <CardDescription>
          Your account was created and is waiting for an administrator to
          approve it. You&apos;ll get access once a role has been assigned.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signOutAction}>
          <Button variant="outline" type="submit" className="w-full">
            Sign out
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
