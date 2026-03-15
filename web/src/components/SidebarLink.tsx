"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  href: string;
  label: string;
  icon: React.ReactNode;
}

export default function SidebarLink({ href, label, icon }: Props) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
        isActive
          ? "nav-active text-white font-medium"
          : "text-gray-400 hover:bg-white/5 hover:text-gray-100"
      }`}
    >
      <span
        className={`shrink-0 transition-colors duration-200 ${
          isActive ? "text-blue-400" : "text-gray-500 group-hover:text-gray-300"
        }`}
      >
        {icon}
      </span>
      {label}
    </Link>
  );
}
