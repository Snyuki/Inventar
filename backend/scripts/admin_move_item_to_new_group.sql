-- ============================================================
-- Admin Script: Move item name to a different group
-- ============================================================
-- Usage: Replace the variables at the top with the actual values
-- Run directly in Supabase SQL Editor
-- ============================================================

DO $$
DECLARE
    v_item_name        TEXT := 'Milch';           -- The item name to move
    v_new_group_name   TEXT := 'Milchprodukte';   -- The target group name

    v_registry_id      UUID;
    v_old_group_id     TEXT;
    v_new_group_id     TEXT;
    v_storage_id       UUID;                      -- Storage of the old group, used when creating a new group
    v_item_count       INT;
BEGIN
    -- 1. Find the registry entry
    SELECT id, group_id INTO v_registry_id, v_old_group_id
    FROM item_name_to_group_registry
    WHERE item_name = v_item_name;

    IF v_registry_id IS NULL THEN
        RAISE EXCEPTION 'Item name "%" not found in registry', v_item_name;
    END IF;

    -- 2. Get storage_id from the old group so the new group is created in the same storage
    SELECT storage_id INTO v_storage_id
    FROM item_groups
    WHERE id = v_old_group_id;

    -- 3. Find the target group (scoped to the same storage)
    --    If it doesn't exist yet, create it
    SELECT id INTO v_new_group_id
    FROM item_groups
    WHERE LOWER(group_name) = LOWER(v_new_group_name)
      AND storage_id = v_storage_id;

    IF v_new_group_id IS NULL THEN
        INSERT INTO item_groups (id, group_name, storage_id)
        VALUES (gen_random_uuid()::text, v_new_group_name, v_storage_id)
        RETURNING id INTO v_new_group_id;
        RAISE NOTICE 'Created new group "%" with id %', v_new_group_name, v_new_group_id;
    END IF;

    IF v_old_group_id = v_new_group_id THEN
        RAISE EXCEPTION 'Item "%" is already in group "%"', v_item_name, v_new_group_name;
    END IF;

    -- 4. Count affected items
    SELECT COUNT(*) INTO v_item_count
    FROM items
    WHERE name_to_group_id = v_registry_id;

    RAISE NOTICE 'Moving "%" (% items) from group % to "%"',
        v_item_name, v_item_count, v_old_group_id, v_new_group_name;

    -- 5. Move all items to the new group
    UPDATE items
    SET group_id = v_new_group_id
    WHERE name_to_group_id = v_registry_id;

    -- 6. Update the registry entry
    UPDATE item_name_to_group_registry
    SET group_id = v_new_group_id
    WHERE id = v_registry_id;

    -- 7. Delete old group if now empty
    IF NOT EXISTS (SELECT 1 FROM items WHERE group_id = v_old_group_id) THEN
        DELETE FROM item_groups WHERE id = v_old_group_id;
        RAISE NOTICE 'Deleted now-empty old group %', v_old_group_id;
    END IF;

    RAISE NOTICE 'Done! Successfully moved "%" to "%"', v_item_name, v_new_group_name;
END $$;