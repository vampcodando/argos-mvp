import { StatusBadge } from "../../components/StatusBadge";
import { models } from "../../state/argosOperationalState";

export function ModelsPanel() {
  return (
    <div className="panel-grid">
      {models.map((model) => (
        <article className="panel-card" key={model.id}>
          <span className="card-kicker">{model.provider}</span>
          <h3>{model.name}</h3>
          <p>{model.purpose}</p>

          <div className="mission-meta">
            <span>Pago: {model.paid ? "sim" : "nao"}</span>
            <span>Aprovacao: {model.approvalRequired ? "obrigatoria" : "nao"}</span>
          </div>

          <StatusBadge status={model.status} />
        </article>
      ))}
    </div>
  );
}

