-- ============================================================
-- Admin Script: Erstellt eine neue Gruppe in den group_templates,
--               damit die Gruppe im Frontend als Option erscheint.
--               Diese Gruppe ist allerdings noch nicht aktiv.
--
-- Verwendung:
--   1. Variablen unten anpassen
--   2. Script im Supabase SQL Editor ausführen
-- ============================================================

-- ── Konfiguration ──────────────────────────────────────────
DO $$
DECLARE
    v_group_name TEXT := 'Neue Gruppe';  -- <<< Gruppenname hier anpassen
-- ───────────────────────────────────────────────────────────

    v_group_id TEXT;
BEGIN
    -- Prüfen ob Gruppe bereits in group_templates existiert
    IF EXISTS (
        SELECT 1 FROM group_templates WHERE LOWER(group_name) = LOWER(v_group_name)
    ) THEN
        RAISE NOTICE 'Gruppe "%" existiert bereits in group_templates — wird übersprungen.', v_group_name;
    ELSE
        INSERT INTO group_templates (group_name)
        VALUES (v_group_name);
        RAISE NOTICE 'Gruppe "%" wurde in group_templates eingetragen.', v_group_name;
    END IF;

END $$;