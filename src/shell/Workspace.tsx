import type { ReactNode } from "react";
import type { NavItem } from "../app/navigation";

type WorkspaceProps = {
  activeItem: NavItem;
  children: ReactNode;
};

export function Workspace({ activeItem, children }: WorkspaceProps) {
  return (
    <section className="workspace">
      <div className="workspace-header">
        <div>
          <span className="workspace-eyebrow">Modulo ativo</span>
          <h2>{activeItem.label}</h2>
        </div>
        <div className="workspace-state">
          <span>comando</span>
          <strong>-&gt;</strong>
          <span>log</span>
          <strong>-&gt;</strong>
          <span>validacao</span>
        </div>
      </div>

      {children}
    </section>
  );
}

