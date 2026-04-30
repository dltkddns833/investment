import { headers } from "next/headers";
import QConsoleClient from "@/components/QConsoleClient";

export const dynamic = "force-dynamic";

async function getInitialStatus() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:4001";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const res = await fetch(`${proto}://${host}/api/status`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to load status: ${res.status}`);
  }
  return res.json();
}

export default async function HomePage() {
  const initial = await getInitialStatus();
  return <QConsoleClient initial={initial} />;
}
