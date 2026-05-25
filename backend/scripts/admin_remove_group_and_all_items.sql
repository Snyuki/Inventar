-- ============================================================
-- Admin Script: Remove a group and all its items
-- ============================================================
-- WARNING: This is highly destructive. All items in the group
--          and their registry links will be permanently deleted.
-- Usage: Replace the variables at the top with the actual values
-- Run directly in Supabase SQL Editor
-- ============================================================

DO $$
DECLARE
    v_group_name   TEXT := 'Sonstiges';   -- The group to remove

    v_group_id     TEXT;
    v_item_count   INT;
    v_link_count   INT;
BEGIN
    -- 1. Find the group
    SELECT id INTO v_group_id
    FROM item_groups
    WHERE LOWER(group_name) = LOWER(v_group_name);

    IF v_group_id IS NULL THEN
        RAISE EXCEPTION 'Group "%" not found', v_group_name;
    END IF;

    -- 2. Count affected items and registry links for the summary
    SELECT COUNT(*) INTO v_item_count
    FROM items
    WHERE group_id = v_group_id;

    SELECT COUNT(*) INTO v_link_count
    FROM item_name_to_group_registry
    WHERE group_id = v_group_id;

    RAISE NOTICE 'Removing group "%" (% items, % registry links)...', v_group_name, v_item_count, v_link_count;

    -- 3. Delete all items in the group
    DELETE FROM items
    WHERE group_id = v_group_id;

    -- 4. Delete all registry links pointing to this group
    DELETE FROM item_name_to_group_registry
    WHERE group_id = v_group_id;

    -- 5. Delete the group itself
    DELETE FROM item_groups
    WHERE id = v_group_id;

    RAISE NOTICE 'Done! Removed group "%", % items and % registry links.', v_group_name, v_item_count, v_link_count;
END $$;