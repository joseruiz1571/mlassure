import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { RawEvidence, AssessmentTarget } from "../types.js";
import type { AwsProvider } from "./aws-provider.interface.js";

function now(): string {
  return new Date().toISOString();
}

function raw(source: string, payload: unknown): RawEvidence {
  return {
    id: randomUUID(),
    source,
    retrievedAt: now(),
    payload,
  };
}

export class FixtureProvider implements AwsProvider {
  private readonly fixture: Record<string, unknown>;

  constructor(fixturePath: string) {
    const text = readFileSync(fixturePath, "utf-8");
    this.fixture = JSON.parse(text) as Record<string, unknown>;
  }

  async getModelRegistryEntry(
    _target: AssessmentTarget
  ): Promise<RawEvidence | null> {
    const v = this.fixture["registry"];
    return v != null ? raw("sagemaker:model-registry:entry", v) : null;
  }

  async getModelCard(
    _target: AssessmentTarget
  ): Promise<RawEvidence | null> {
    const v = this.fixture["modelCard"];
    return v != null ? raw("sagemaker:model-card", v) : null;
  }

  async getEndpointConfig(
    _target: AssessmentTarget
  ): Promise<RawEvidence | null> {
    const v = this.fixture["endpoint"];
    return v != null ? raw("sagemaker:endpoint:config", v) : null;
  }

  async getDataCaptureConfig(
    _target: AssessmentTarget
  ): Promise<RawEvidence | null> {
    const endpoint = this.fixture["endpoint"];
    if (endpoint == null || typeof endpoint !== "object") return null;
    const e = endpoint as Record<string, unknown>;
    const capture = {
      dataCaptureEnabled: e["dataCaptureEnabled"],
      capturePercentage: e["capturePercentage"],
      captureDestination: e["captureDestination"],
    };
    return raw("sagemaker:endpoint:data-capture", capture);
  }

  async getModelMonitorSchedules(
    _target: AssessmentTarget
  ): Promise<RawEvidence[]> {
    const monitors = this.fixture["monitors"];
    if (!Array.isArray(monitors)) return [];
    return monitors.map((m) =>
      raw("sagemaker:model-monitor:schedules", m)
    );
  }

  async getKMSConfig(
    _target: AssessmentTarget
  ): Promise<RawEvidence | null> {
    const v = this.fixture["kms"];
    return v != null ? raw("sagemaker:kms:config", v) : null;
  }

  async getEndpointNetworkConfig(
    _target: AssessmentTarget
  ): Promise<RawEvidence | null> {
    const v = this.fixture["network"];
    return v != null ? raw("sagemaker:endpoint:network", v) : null;
  }

  async getEndpointExecutionRole(
    _target: AssessmentTarget
  ): Promise<RawEvidence | null> {
    const v = this.fixture["executionRole"];
    return v != null ? raw("sagemaker:iam:execution-role", v) : null;
  }

  async getCloudTrailEvents(
    _target: AssessmentTarget,
    _since: Date
  ): Promise<RawEvidence[]> {
    const events = this.fixture["cloudtrailEvents"];
    if (!Array.isArray(events)) return [];
    return events.map((e) => raw("cloudtrail:events", e));
  }
}
