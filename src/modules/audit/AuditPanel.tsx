const events = [
  ["Snapshot", "ARGOS iniciado oficialmente com estrategia modular."],
  ["Auditoria", "Odysseus aprovado como referencia visual, nao como base tecnica."],
  ["MVP", "Vite React criado e commit inicial registrado."],
];

export function AuditPanel() {
  return (
    <section className="panel-card">
      <span className="card-kicker">Auditoria inicial</span>
      <h3>Linha do tempo local</h3>

      <div className="timeline">
        {events.map(([title, description]) => (
          <div className="timeline-item" key={title}>
            <strong>{title}</strong>
            <span>{description}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

