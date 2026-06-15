const models = [
  ["OpenAI API", "Mestre principal futuro", "bloqueado"],
  ["Ollama", "Especialistas locais apos sabatina", "sabatina"],
  ["OpenAI-compatible", "Endpoints externos compativeis", "pendente"],
];

export function ModelsPanel() {
  return (
    <div className="panel-grid">
      {models.map(([name, description, status]) => (
        <article className="panel-card" key={name}>
          <span className="card-kicker">Modelo</span>
          <h3>{name}</h3>
          <p>{description}</p>
          <span className="badge">{status}</span>
        </article>
      ))}
    </div>
  );
}

