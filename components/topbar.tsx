import { MobileNav } from "@/components/mobile-nav";

/** Mobile header + drawer below `md`; desktop keeps the sidebar and this stays visually empty. */
export function Topbar() {
  return <MobileNav />;
}
