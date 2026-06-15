const rows = [
  ["comando", "Aguardando proposta tecnica."],
  ["log", "Nenhum comando executado pelo ARGOS ainda."],
  ["interpretacao", "Sem diagnostico pendente."],
  ["validacao", "Aprovacao humana obrigatoria antes de qualquer acao perigosa."],
];

export function ConsolePanel() {
  return (
    <section className="console-panel">
      <header>
        <span className="card-kicker">Console tecnico</span>
        <h3>Comando -&gt; log -&gt; interpretacao -&gt; validacao</h3>
      </header>

      <div className="console-window">
        {rows.map(([label, value]) => (
          <div className="console-row" key={label}>
            <span>{label}</span>
            <code>{value}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

