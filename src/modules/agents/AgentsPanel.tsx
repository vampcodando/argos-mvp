import { StatusBadge } from "../../components/StatusBadge";
import { agents } from "../../state/argosOperationalState";

export function AgentsPanel() {
  return (
    <div className="panel-grid">
      {agents.map((agent) => (
        <article className="panel-card" key={agent.id}>
          <span className="card-kicker">{agent.role}</span>
          <h3>{agent.name}</h3>
          <p>Modelo: {agent.model}</p>

          <StatusBadge status={agent.status} />

          <div className="mini-section">
            <strong>Permissoes</strong>
            <ul>
              {agent.permissions.map((permission) => (
                <li key={permission}>{permission}</li>
              ))}
            </ul>
          </div>

          <div className="mini-section danger">
            <strong>Bloqueios</strong>
            <ul>
              {agent.blockedActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
        </article>
      ))}
    </div>
  );
}

