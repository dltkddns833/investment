"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  href: string;
  label: string;
}

export default function SidebarLink({ href, label }: Props) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
        isActive
          ? "nav-active text-white font-medium"
          : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
      }`}
    >
      {label}
    </Link>
  );
}
