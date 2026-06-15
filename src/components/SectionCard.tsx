import type { ReactNode } from "react";

type SectionCardProps = {
  kicker?: string;
  title: string;
  children: ReactNode;
};

export function SectionCard({ kicker, title, children }: SectionCardProps) {
  return (
    <section className="panel-card">
      {kicker ? <span className="card-kicker">{kicker}</span> : null}
      <h3>{title}</h3>
      {children}
    </section>
  );
}

