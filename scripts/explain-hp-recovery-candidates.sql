PRAGMA query_only = ON;

SELECT COUNT(*) AS applied_migrations
FROM _prisma_migrations
WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;

SELECT name, sql
FROM sqlite_schema
WHERE name IN (
  'hp_recovery_notifications_character_id_key',
  'hp_recovery_notifications_status_next_attempt_at_idx',
  'hp_recovery_notifications_status_processing_started_at_idx'
)
ORDER BY name;

EXPLAIN QUERY PLAN
SELECT * FROM (
  SELECT * FROM (
    SELECT id, next_attempt_at AS due_at, updated_at
    FROM hp_recovery_notifications
      INDEXED BY hp_recovery_notifications_status_next_attempt_at_idx
    WHERE status = 'waiting' AND next_attempt_at <= 9223372036854775807
    ORDER BY next_attempt_at, updated_at, id
    LIMIT 13
  ) AS waiting_due
  UNION ALL
  SELECT * FROM (
    SELECT id, next_attempt_at AS due_at, updated_at
    FROM hp_recovery_notifications
      INDEXED BY hp_recovery_notifications_status_next_attempt_at_idx
    WHERE status = 'ready' AND next_attempt_at <= 9223372036854775807
    ORDER BY next_attempt_at, updated_at, id
    LIMIT 13
  ) AS ready_due
  UNION ALL
  SELECT * FROM (
    SELECT id, processing_started_at AS due_at, updated_at
    FROM hp_recovery_notifications
      INDEXED BY hp_recovery_notifications_status_processing_started_at_idx
    WHERE status = 'checking' AND processing_started_at <= 9223372036854775807
    ORDER BY processing_started_at, updated_at, id
    LIMIT 13
  ) AS stale_checking
  UNION ALL
  SELECT * FROM (
    SELECT id, processing_started_at AS due_at, updated_at
    FROM hp_recovery_notifications
      INDEXED BY hp_recovery_notifications_status_processing_started_at_idx
    WHERE status = 'sending' AND processing_started_at <= 9223372036854775807
    ORDER BY processing_started_at, updated_at, id
    LIMIT 13
  ) AS stale_sending
) AS bounded_candidates
ORDER BY due_at, updated_at, id
LIMIT 13;
