import { StatusBadge } from "../../components/StatusBadge";
import { consoleEvents } from "../../state/argosOperationalState";

export function ConsolePanel() {
  return (
    <section className="console-panel">
      <header>
        <span className="card-kicker">Console tecnico</span>
        <h3>Comando -&gt; log -&gt; interpretacao -&gt; validacao</h3>
      </header>

      <div className="console-window">
        {consoleEvents.map((event) => (
          <div className="console-row rich" key={event.id}>
            <span>{event.kind}</span>
            <div>
              <strong>{event.title}</strong>
              <code>{event.detail}</code>
              <StatusBadge status={event.status} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

