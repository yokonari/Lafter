import agencyJson from "../../data/agencies/agency.json";
import type { AgenciesById } from "../../data/agencies/types";

// agency.jsonから事務所IDと名前のマッピングを生成
const agencyData = agencyJson as AgenciesById;
export const AGENCY_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(agencyData.agency).map(([id, data]) => [id, data.name])
);
