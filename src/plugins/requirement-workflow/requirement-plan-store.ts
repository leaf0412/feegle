import { randomBytes } from "node:crypto";
import type { RuntimeDb } from "@infra/app/runtime-db.js";
import type { RequirementPlanSource, RequirementPlanVersion } from "./requirement-plan-models.js";

interface DbRequirementPlanVersionRow {
  plan_id: string;
  requirement_id: string;
  version: number;
  author_user_id: string;
  summary: string;
  markdown: string;
  source: string;
  feedback: string | null;
  created_at: string;
}

function mapRow(row: DbRequirementPlanVersionRow): RequirementPlanVersion {
  return {
    planId: row.plan_id,
    requirementId: row.requirement_id,
    version: row.version,
    authorUserId: row.author_user_id,
    summary: row.summary,
    markdown: row.markdown,
    source: row.source as RequirementPlanSource,
    feedback: row.feedback ?? undefined,
    createdAt: row.created_at
  };
}

function generatePlanId(): string {
  const random = randomBytes(12).toString("base64url");
  return `reqplan_${random}`;
}

export class RequirementPlanStore {
  constructor(private readonly db: RuntimeDb) {
    this.db.exec(`
      create table if not exists requirement_plan_versions (
        plan_id text primary key,
        requirement_id text not null,
        version integer not null,
        author_user_id text not null,
        summary text not null,
        markdown text not null,
        source text not null,
        feedback text,
        created_at text not null,
        unique(requirement_id, version)
      );
      create index if not exists requirement_plan_versions_requirement_idx
        on requirement_plan_versions(requirement_id, version);
    `);
  }

  createVersion(input: {
    requirementId: string;
    authorUserId: string;
    summary: string;
    markdown: string;
    source: RequirementPlanSource;
    feedback?: string;
  }): RequirementPlanVersion {
    if (!input.markdown.trim()) {
      throw new Error("Plan markdown is required");
    }

    const insert = this.db.transaction((): RequirementPlanVersion => {
      const nextVersionRow = this.db
        .prepare(
          `select coalesce(max(version), 0) + 1 as next_version
           from requirement_plan_versions
           where requirement_id = ?`
        )
        .get(input.requirementId) as { next_version: number };

      const record: RequirementPlanVersion = {
        planId: generatePlanId(),
        requirementId: input.requirementId,
        version: nextVersionRow.next_version,
        authorUserId: input.authorUserId,
        summary: input.summary,
        markdown: input.markdown,
        source: input.source,
        feedback: input.feedback,
        createdAt: new Date().toISOString()
      };

      this.db
        .prepare(
          `insert into requirement_plan_versions
             (plan_id, requirement_id, version, author_user_id, summary, markdown, source, feedback, created_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          record.planId,
          record.requirementId,
          record.version,
          record.authorUserId,
          record.summary,
          record.markdown,
          record.source,
          record.feedback ?? null,
          record.createdAt
        );

      return record;
    });

    return insert();
  }

  latest(requirementId: string): RequirementPlanVersion | undefined {
    const row = this.db
      .prepare(
        `select plan_id, requirement_id, version, author_user_id, summary, markdown, source, feedback, created_at
         from requirement_plan_versions
         where requirement_id = ?
         order by version desc
         limit 1`
      )
      .get(requirementId) as DbRequirementPlanVersionRow | undefined;

    return row ? mapRow(row) : undefined;
  }

  listVersions(requirementId: string): RequirementPlanVersion[] {
    const rows = this.db
      .prepare(
        `select plan_id, requirement_id, version, author_user_id, summary, markdown, source, feedback, created_at
         from requirement_plan_versions
         where requirement_id = ?
         order by version asc`
      )
      .all(requirementId) as DbRequirementPlanVersionRow[];

    return rows.map(mapRow);
  }
}
