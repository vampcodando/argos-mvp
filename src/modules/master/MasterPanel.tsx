export function MasterPanel() {
  return (
    <div className="panel-grid two-columns">
      <section className="panel-card hero-card">
        <span className="card-kicker">Mestre / Orquestrador</span>
        <h2>ARGOS esta em modo visual inicial.</h2>
        <p>
          Este painel sera o ponto de conversa com o orquestrador principal.
          Por enquanto ele e apenas frontend local: sem API paga, sem agentes reais
          e sem execucao de comandos.
        </p>

        <div className="mission-rule">
          <strong>Regra-mae ativa</strong>
          <span>Nenhuma acao perigosa sem aprovacao explicita.</span>
        </div>
      </section>

      <section className="panel-card">
        <span className="card-kicker">Plano da missao</span>
        <ol className="step-list">
          <li><strong>Shell visual</strong><span>Recriar layout inspirado no Odysseus.</span></li>
          <li><strong>Estado local</strong><span>Definir missoes, agentes e modelos mockados.</span></li>
          <li><strong>Console tecnico</strong><span>Registrar comando, log, interpretacao e aprovacao.</span></li>
          <li><strong>Motor</strong><span>Integrar OpenAI Agents SDK somente apos aprovacao.</span></li>
        </ol>
      </section>
    </div>
  );
}

