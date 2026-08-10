import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/session";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(homeFor(user));
}
