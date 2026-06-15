const nodes = [
  ["Entrada", "Requisitos"],
  ["Mestre", "Orquestracao"],
  ["Revisor", "Critica"],
  ["Console", "Validacao"],
];

export function CanvasPanel() {
  return (
    <div className="canvas-stage">
      <div className="canvas-line" />

      <div className="canvas-node-list">
        {nodes.map(([title, subtitle]) => (
          <div className="canvas-node" key={title}>
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </div>
        ))}
      </div>

      <p className="canvas-note">
        Canvas visual inspirado na logica de workflows. Nesta fase e apenas mock visual.
      </p>
    </div>
  );
}

