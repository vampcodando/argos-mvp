import { StatusBadge } from "../../components/StatusBadge";
import { auditEvents } from "../../state/argosOperationalState";

export function AuditPanel() {
  return (
    <section className="panel-card">
      <span className="card-kicker">Auditoria inicial</span>
      <h3>Linha do tempo operacional</h3>

      <div className="timeline">
        {auditEvents.map((event) => (
          <div className="timeline-item" key={event.id}>
            <div className="timeline-head">
              <strong>{event.title}</strong>
              <StatusBadge status={event.status} />
            </div>
            <span>{event.detail}</span>
            <code>{event.evidence}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

