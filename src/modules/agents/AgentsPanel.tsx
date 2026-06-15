const agents = [
  ["Mestre", "Coordena missao, cobra evidencia e decide proximos passos."],
  ["Planejador", "Divide missoes grandes em etapas pequenas."],
  ["Revisor Critico", "Tenta reprovar solucao antes de aplicar."],
  ["Executor Controlado", "Executa somente comandos aprovados pelo usuario."],
];

export function AgentsPanel() {
  return (
    <div className="panel-grid">
      {agents.map(([name, description]) => (
        <article className="panel-card" key={name}>
          <span className="card-kicker">Cargo inicial</span>
          <h3>{name}</h3>
          <p>{description}</p>
          <span className="badge pending">mockado</span>
        </article>
      ))}
    </div>
  );
}

