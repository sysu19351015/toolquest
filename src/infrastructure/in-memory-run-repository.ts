import type { RunRepository } from "../application/ports.js";
import type { RunRecord } from "../domain/types.js";

export class InMemoryRunRepository implements RunRepository {
  private readonly records = new Map<string, RunRecord>();

  public find(runId: string): RunRecord | undefined {
    const record = this.records.get(runId);
    return record === undefined ? undefined : structuredClone(record);
  }

  public save(record: RunRecord): void {
    this.records.set(record.runId, structuredClone(record));
  }
}
