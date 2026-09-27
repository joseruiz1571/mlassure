import { readFileSync } from "node:fs";
import type { AssessmentTarget } from "../types.js";
import type { EvidenceProvider } from "./evidence-provider.interface.js";
import { awsSageMakerProvider, AWS_SAGEMAKER_FAMILY } from "./aws-sagemaker.js";
import { FixtureProvider } from "./fixture-provider.js";
import { POC_EVIDENCE_FAMILY, pocProviderFromDescriptor } from "./poc-evidence.js";

export const KNOWN_FAMILIES = [AWS_SAGEMAKER_FAMILY, POC_EVIDENCE_FAMILY] as const;

/**
 * Reads a target file and picks its provider from the target's `family`
 * (M8b). An absent `family` means `aws-sagemaker`, so every target file
 * written before M8b keeps working; an unrecognised one is an error naming it.
 */
export function loadTarget(targetPath: string): {
  target: AssessmentTarget;
  provider: EvidenceProvider;
} {
  const target = JSON.parse(readFileSync(targetPath, "utf-8")) as AssessmentTarget;
  const family = target["family"] ?? AWS_SAGEMAKER_FAMILY;
  if (family === AWS_SAGEMAKER_FAMILY) {
    return { target, provider: awsSageMakerProvider(new FixtureProvider(targetPath)) };
  }
  if (family === POC_EVIDENCE_FAMILY) {
    return { target, provider: pocProviderFromDescriptor(target, targetPath) };
  }
  throw new Error(
    `Target "${targetPath}" names unknown family ${JSON.stringify(family)}; known families: ${KNOWN_FAMILIES.join(", ")}`
  );
}
