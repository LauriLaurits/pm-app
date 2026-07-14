import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/dashboard"); // middleware sends unauthenticated users to /login
}
