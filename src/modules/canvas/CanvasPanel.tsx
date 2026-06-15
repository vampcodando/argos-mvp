import { missions } from "../../state/argosOperationalState";

const workflow = [
  ["Entrada", "Requisitos e contexto"],
  ["Mestre", "Plano de acao"],
  ["Agentes", "Divisao de tarefas"],
  ["Console", "Validacao humana"],
  ["Auditoria", "Snapshot e historico"],
];

export function CanvasPanel() {
  return (
    <div className="canvas-stage">
      <div className="canvas-line" />

      <div className="canvas-node-list">
        {workflow.map(([title, subtitle]) => (
          <div className="canvas-node" key={title}>
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </div>
        ))}
      </div>

      <p className="canvas-note">
        Canvas v0.2 ainda e visual e local. Missoes carregadas: {missions.length}.
      </p>
    </div>
  );
}

