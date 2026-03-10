import Link from "next/link";
import { getConfig } from "@/lib/data";

export default function Sidebar() {
  const config = getConfig();

  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col bg-gray-900 border-r border-gray-800 h-screen sticky top-0">
      <div className="p-5 border-b border-gray-800">
        <Link href="/" className="text-lg font-bold">
          모의 투자
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        <SidebarLink href="/" label="대시보드" />
        <div className="pt-4 pb-2 px-3 text-xs text-gray-500 uppercase tracking-wider">
          투자자
        </div>
        {config.investors.map((inv) => (
          <SidebarLink
            key={inv.id}
            href={`/investors/${inv.id}`}
            label={inv.name}
          />
        ))}
      </nav>
    </aside>
  );
}

function SidebarLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
    >
      {label}
    </Link>
  );
}
