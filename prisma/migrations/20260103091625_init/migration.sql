-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "state" TEXT NOT NULL,
    "current_iteration" INTEGER NOT NULL DEFAULT 0,
    "max_iterations" INTEGER NOT NULL,
    "quality_threshold" REAL NOT NULL,
    "last_quality_score" REAL,
    "score_history" JSONB NOT NULL,
    "content_hashes" JSONB NOT NULL,
    "elapsed_time_ms" BIGINT NOT NULL DEFAULT 0,
    "start_time" BIGINT NOT NULL,
    "task_timeout_minutes" INTEGER NOT NULL DEFAULT 30,
    "time_per_iteration_ms" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "content" TEXT,
    "metadata" JSONB,
    "timestamp" BIGINT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Artifact_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "review_depth" TEXT NOT NULL,
    "quality_score" REAL NOT NULL,
    "defects" JSONB NOT NULL,
    "test_coverage_estimate" REAL NOT NULL,
    "policy_violations" JSONB NOT NULL,
    "suggestions" JSONB NOT NULL,
    "recommendation" TEXT NOT NULL,
    "required_changes" JSONB NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Session_state_idx" ON "Session"("state");

-- CreateIndex
CREATE INDEX "Session_created_at_idx" ON "Session"("created_at");

-- CreateIndex
CREATE INDEX "Artifact_session_id_idx" ON "Artifact"("session_id");

-- CreateIndex
CREATE INDEX "Artifact_type_idx" ON "Artifact"("type");

-- CreateIndex
CREATE INDEX "Artifact_timestamp_idx" ON "Artifact"("timestamp");

-- CreateIndex
CREATE INDEX "Review_session_id_idx" ON "Review"("session_id");

-- CreateIndex
CREATE INDEX "Review_artifact_id_idx" ON "Review"("artifact_id");

-- CreateIndex
CREATE INDEX "Review_quality_score_idx" ON "Review"("quality_score");
