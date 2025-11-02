-- 最新500件だけ残すトリガ
DROP TRIGGER IF EXISTS trg_search_logs_trim;

CREATE TRIGGER trg_search_logs_trim
AFTER INSERT ON search_logs
BEGIN
  DELETE FROM search_logs
  WHERE id NOT IN (
    SELECT id FROM search_logs
    ORDER BY created_at DESC, id DESC
    LIMIT 500
  );
END;
