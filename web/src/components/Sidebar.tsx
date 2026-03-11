import { getConfig } from "@/lib/data";
import SidebarLink from "./SidebarLink";
import LogoIcon from "./LogoIcon";

export default async function Sidebar() {
  const config = await getConfig();

  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col bg-gray-900/80 backdrop-blur-xl border-r border-white/5 h-screen sticky top-0">
      <div className="p-5 border-b border-white/5 flex items-center gap-2.5">
        <LogoIcon size={28} />
        <span className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          모의 투자
        </span>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        <SidebarLink href="/" label="대시보드" />
        <SidebarLink href="/reports" label="리포트" />
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
      <div className="gradient-separator mx-4" />
      <div className="p-4 text-xs text-gray-600 text-center">
        Investment Simulator
      </div>
    </aside>
  );
}
