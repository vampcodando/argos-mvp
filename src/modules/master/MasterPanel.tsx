import { SectionCard } from "../../components/SectionCard";
import { StatusBadge } from "../../components/StatusBadge";
import { agents, dashboard, missions } from "../../state/argosOperationalState";

export function MasterPanel() {
  const activeMissions = missions.length;
  const blockedAgents = agents.filter((agent) => agent.status === "blocked").length;
  const approvalMissions = missions.filter((mission) => mission.requiresApproval).length;

  return (
    <div className="panel-grid two-columns">
      <section className="panel-card hero-card">
        <span className="card-kicker">Mestre / Orquestrador</span>
        <h2>ARGOS {dashboard.version} em estado operacional local.</h2>
        <p>
          O shell visual agora le dados locais de missoes, agentes, modelos,
          console e auditoria. Ainda nao existe backend, API paga ou execucao real.
        </p>

        <div className="metric-grid">
          <div className="metric-card">
            <strong>{activeMissions}</strong>
            <span>missoes</span>
          </div>
          <div className="metric-card">
            <strong>{agents.length}</strong>
            <span>agentes</span>
          </div>
          <div className="metric-card">
            <strong>{approvalMissions}</strong>
            <span>exigem aprovacao</span>
          </div>
          <div className="metric-card">
            <strong>{blockedAgents}</strong>
            <span>bloqueados</span>
          </div>
        </div>

        <div className="mission-rule">
          <strong>Regra-mae ativa</strong>
          <span>Nenhuma acao perigosa sem aprovacao explicita.</span>
        </div>
      </section>

      <SectionCard kicker="Missoes em foco" title="Fila operacional">
        <div className="compact-list">
          {missions.map((mission) => (
            <div className="compact-item" key={mission.id}>
              <div>
                <strong>{mission.name}</strong>
                <span>{mission.nextStep}</span>
              </div>
              <StatusBadge status={mission.status} />
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

