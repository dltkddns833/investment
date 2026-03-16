import SidebarLink from "./SidebarLink";
import LogoIcon from "./LogoIcon";
import {
  LayoutDashboard,
  Users,
  Swords,
  TrendingUp,
  PieChart,
  BarChart2,
} from "lucide-react";

export default async function Sidebar() {
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col bg-gray-900/80 backdrop-blur-xl border-r border-white/5 h-screen sticky top-0">
      <div className="p-5 border-b border-white/5 flex items-center gap-2.5">
        <LogoIcon size={28} />
        <span className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          모의 투자
        </span>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        <SidebarLink href="/" label="대시보드" icon={<LayoutDashboard size={15} />} />

        <div className="my-2 border-t border-white/5" />
        <p className="px-3 pb-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
          투자자
        </p>
        <SidebarLink href="/investors" label="투자자" icon={<Users size={15} />} />
        <SidebarLink href="/versus" label="대결" icon={<Swords size={15} />} />

        <div className="my-2 border-t border-white/5" />
        <p className="px-3 pb-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
          데이터
        </p>
        <SidebarLink href="/stocks" label="종목 분석" icon={<TrendingUp size={15} />} />
        <SidebarLink href="/analysis" label="분석" icon={<PieChart size={15} />} />
        <SidebarLink href="/reports" label="리포트" icon={<BarChart2 size={15} />} />
      </nav>
      <div className="gradient-separator mx-4" />
      <div className="p-4 text-xs text-gray-600 text-center">
        Investment Simulator
      </div>
    </aside>
  );
}
