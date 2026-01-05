import { getClassNameFactory } from "../core";

import styles from "./Header.module.css";

const getClassName = getClassNameFactory("Header", styles);

/** Render a navigation item with active state. */
const NavItem = ({ label, href }: { label: string; href: string }) => {
  const navPath =
    typeof window !== "undefined"
      ? window.location.pathname.replace("/edit", "") || "/"
      : "/";

  const isActive = navPath === (href.replace("/edit", "") || "/");

  const El = href ? "a" : "span";

  return (
    <El
      href={href || "/"}
      style={{
        textDecoration: "none",
        color: isActive
          ? "var(--puck-color-grey-02)"
          : "var(--puck-color-grey-06)",
        fontWeight: isActive ? "600" : "400",
      }}
    >
      {label}
    </El>
  );
};

/** Render the demo header for the root layout. */
const Header = ({ editMode }: { editMode: boolean }) => (
  <div className={getClassName()}>
    <header className={getClassName("inner")}>
      <div className={getClassName("logo")}>LOGO</div>
      <nav className={getClassName("items")}>
        <NavItem label="Home" href={`${editMode ? "" : "/"}`} />
        <NavItem label="Pricing" href={editMode ? "" : "/pricing"} />
        <NavItem label="About" href={editMode ? "" : "/about"} />
      </nav>
    </header>
  </div>
);

export { Header };
