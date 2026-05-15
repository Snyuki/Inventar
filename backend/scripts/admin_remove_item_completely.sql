-- ============================================================
-- Admin Script: Remove item name completely
-- (inclusive registry link and all items with that name)
-- ============================================================
-- Usage: Replace v_item_name at the top with the actual value
-- Run directly in Supabase SQL Editor
-- ============================================================

DO $$
DECLARE
    v_item_name         TEXT := 'Milch';   -- The item name to remove completely

    v_registry_id       UUID;
    v_group_id          TEXT;
    v_group_name        TEXT;
    v_item_count        INT;
    v_age_minutes       NUMERIC;
BEGIN
    -- 1. Find the registry entry
    SELECT r.id, r.group_id, g.group_name,
           ROUND(EXTRACT(EPOCH FROM (now() - r.created_at)) / 60, 1)
    INTO v_registry_id, v_group_id, v_group_name, v_age_minutes
    FROM item_name_to_group_registry r
    JOIN item_groups g ON r.group_id = g.id
    WHERE r.item_name = v_item_name;

    IF v_registry_id IS NULL THEN
        RAISE EXCEPTION 'Item name "%" not found in registry', v_item_name;
    END IF;

    -- 2. Count affected items
    SELECT COUNT(*) INTO v_item_count
    FROM items
    WHERE name_to_group_id = v_registry_id;

    RAISE NOTICE '"%": % item(s) in group "%" — registry entry is % minutes old',
        v_item_name, v_item_count, v_group_name, v_age_minutes;

    -- 3. Safety check — warn if within grace period
    IF v_age_minutes <= 15 THEN
        RAISE NOTICE 'WARNING: Registry entry is still within the 15-minute grace period (% min). Consider waiting or letting the app handle this automatically.', v_age_minutes;
    END IF;

    -- 4. Delete all items with this name
    DELETE FROM items WHERE name_to_group_id = v_registry_id;
    RAISE NOTICE 'Deleted % item(s)', v_item_count;

    -- 5. Delete the registry entry
    DELETE FROM item_name_to_group_registry WHERE id = v_registry_id;
    RAISE NOTICE 'Deleted registry entry for "%"', v_item_name;

    -- 6. Delete group if now empty
    IF NOT EXISTS (SELECT 1 FROM items WHERE group_id = v_group_id) THEN
        DELETE FROM item_groups WHERE id = v_group_id;
        RAISE NOTICE 'Deleted now-empty group "%"', v_group_name;
    ELSE
        RAISE NOTICE 'Group "%" still has items — not deleted', v_group_name;
    END IF;

    RAISE NOTICE 'Done! "%" has been completely removed.', v_item_name;
END $$;