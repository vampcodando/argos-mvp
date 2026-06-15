import { statusLabels, type OperationalStatus } from "../state/argosOperationalState";

export function StatusBadge({ status }: { status: OperationalStatus }) {
  return <span className={"status-badge status-" + status}>{statusLabels[status]}</span>;
}

