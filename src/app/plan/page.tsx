import { loadCountry } from "@/lib/loadCountry";
import { PlanClient } from "./PlanClient";

export const metadata = {
  title: "Your Italy Visa Checklist — Nomade",
};

export default function PlanPage() {
  // Server-side: load and validate YAML
  const countryData = loadCountry("italy");
  return <PlanClient countryData={countryData} />;
}
