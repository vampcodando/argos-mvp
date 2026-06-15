const missions = [
  ["Projeto Novo", "Coleta requisitos, arquitetura, banco, frontend, backend e documentacao."],
  ["Projeto Existente", "Le projeto, diagnostica, corrige, valida e documenta."],
  ["Reconstrucao", "Recebe sistema antigo ou descricao e propoe versao limpa."],
];

export function MissionsPanel() {
  return (
    <div className="panel-grid">
      {missions.map(([name, description]) => (
        <article className="panel-card mission-tile" key={name}>
          <span className="card-kicker">Modo ARGOS</span>
          <h3>{name}</h3>
          <p>{description}</p>
          <button type="button" disabled>Iniciar depois</button>
        </article>
      ))}
    </div>
  );
}

