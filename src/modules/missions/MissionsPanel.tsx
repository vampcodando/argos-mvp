import { StatusBadge } from "../../components/StatusBadge";
import { missions } from "../../state/argosOperationalState";

const modeLabels = {
  new_project: "Projeto novo",
  existing_project: "Projeto existente",
  reconstruction: "Reconstrucao",
};

export function MissionsPanel() {
  return (
    <div className="panel-grid">
      {missions.map((mission) => (
        <article className="panel-card mission-tile" key={mission.id}>
          <span className="card-kicker">{modeLabels[mission.mode]}</span>
          <h3>{mission.name}</h3>
          <p>{mission.objective}</p>

          <div className="mission-meta">
            <span>Owner: {mission.owner}</span>
            <span>Aprovacao: {mission.requiresApproval ? "sim" : "nao"}</span>
          </div>

          <div className="next-step-box">
            <strong>Proximo passo</strong>
            <span>{mission.nextStep}</span>
          </div>

          <StatusBadge status={mission.status} />
        </article>
      ))}
    </div>
  );
}

