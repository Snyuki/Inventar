-- ============================================================
-- Admin Script: Erstellt eine neue Gruppe (falls noch nicht
--               vorhanden) und verschiebt alle Items mit den
--               angegebenen Namen aus der "Sonstiges"-Gruppe (default)
--               in die neue Gruppe.
--
-- Verwendung:
--   1. Variablen unten anpassen
--   2. Script im Supabase SQL Editor ausführen
-- ============================================================

-- ── Konfiguration ──────────────────────────────────────────
DO $$
DECLARE
    v_new_group_name  TEXT    := 'Neue Gruppe';        -- <<< Ziel-Gruppenname
    v_sonstiges_name  TEXT    := 'Sonstiges';          -- <<< Quell-Gruppe (normalerweise nicht ändern)
    v_item_names      TEXT[]  := ARRAY[               -- <<< Item-Namen die verschoben werden sollen
        'Beispiel Item 1',
        'Beispiel Item 2'
    ];
-- ───────────────────────────────────────────────────────────

    v_new_group_id    TEXT;
    v_sonstiges_id    TEXT;
    v_storage_id      UUID;
    v_item_name       TEXT;
    v_registry_id     UUID;
    v_registry_group  TEXT;
    v_moved_count     INT := 0;
    v_skipped_count   INT := 0;
BEGIN

    -- ── 1. Sonstiges-Gruppe finden (zuerst, da wir storage_id brauchen) ──
    SELECT id, storage_id INTO v_sonstiges_id, v_storage_id
    FROM item_groups
    WHERE LOWER(group_name) = LOWER(v_sonstiges_name);

    IF v_sonstiges_id IS NULL THEN
        RAISE EXCEPTION 'Quell-Gruppe "%" nicht gefunden. Abbruch.', v_sonstiges_name;
    END IF;

    RAISE NOTICE 'Quell-Gruppe "%" gefunden (id: %, storage_id: %).', v_sonstiges_name, v_sonstiges_id, v_storage_id;


    -- ── 2. Neue Gruppe erstellen (im selben Storage wie Sonstiges) ────────
    SELECT id INTO v_new_group_id
    FROM item_groups
    WHERE LOWER(group_name) = LOWER(v_new_group_name)
      AND storage_id = v_storage_id;

    IF v_new_group_id IS NULL THEN
        v_new_group_id := gen_random_uuid()::TEXT;
        INSERT INTO item_groups (id, group_name, storage_id)
        VALUES (v_new_group_id, v_new_group_name, v_storage_id);
        RAISE NOTICE 'Gruppe "%" erstellt (id: %).', v_new_group_name, v_new_group_id;
    ELSE
        RAISE NOTICE 'Gruppe "%" existiert bereits (id: %).', v_new_group_name, v_new_group_id;
    END IF;

    -- group_templates Eintrag
    IF NOT EXISTS (
        SELECT 1 FROM group_templates WHERE LOWER(group_name) = LOWER(v_new_group_name)
    ) THEN
        INSERT INTO group_templates (group_name) VALUES (v_new_group_name);
        RAISE NOTICE 'Gruppe "%" in group_templates eingetragen.', v_new_group_name;
    END IF;


    -- ── 3. Items migrieren ────────────────────────────────
    FOREACH v_item_name IN ARRAY v_item_names LOOP

        -- Registry-Eintrag für diesen Namen finden
        SELECT id, group_id INTO v_registry_id, v_registry_group
        FROM item_name_to_group_registry
        WHERE LOWER(item_name) = LOWER(v_item_name);

        IF v_registry_id IS NULL THEN
            RAISE NOTICE '  [SKIP] "%" — kein Registry-Eintrag gefunden.', v_item_name;
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        IF v_registry_group != v_sonstiges_id THEN
            RAISE NOTICE '  [SKIP] "%" — liegt nicht in "%" sondern in einer anderen Gruppe.', v_item_name, v_sonstiges_name;
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        -- Registry auf neue Gruppe umschreiben
        UPDATE item_name_to_group_registry
        SET group_id = v_new_group_id
        WHERE id = v_registry_id;

        -- Alle Items dieser Registry in die neue Gruppe verschieben
        UPDATE items
        SET group_id = v_new_group_id
        WHERE name_to_group_id = v_registry_id;

        RAISE NOTICE '  [OK]   "%" wurde nach "%" verschoben.', v_item_name, v_new_group_name;
        v_moved_count := v_moved_count + 1;

    END LOOP;


    -- ── 4. Sonstiges-Gruppe löschen wenn leer ────────────
    IF NOT EXISTS (
        SELECT 1 FROM items WHERE group_id = v_sonstiges_id
    ) THEN
        DELETE FROM item_groups WHERE id = v_sonstiges_id;
        RAISE NOTICE 'Quell-Gruppe "%" war leer und wurde gelöscht.', v_sonstiges_name;
    ELSE
        RAISE NOTICE 'Quell-Gruppe "%" hat noch Items — wird nicht gelöscht.', v_sonstiges_name;
    END IF;


    -- ── 5. Zusammenfassung ────────────────────────────────
    RAISE NOTICE '';
    RAISE NOTICE '══ Fertig ══════════════════════════════════';
    RAISE NOTICE '  Verschoben: % Item-Typ(en)', v_moved_count;
    RAISE NOTICE '  Übersprungen: % Item-Typ(en)', v_skipped_count;
    RAISE NOTICE '════════════════════════════════════════════';

END $$;