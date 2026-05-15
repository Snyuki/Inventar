-- ============================================================
-- Cleanup Script: Remove orphaned data
-- ============================================================
-- Run in Supabase SQL Editor
-- Safe to run multiple times (idempotent)
-- ============================================================

DO $$
DECLARE
    v_orphaned_groups INT;
    v_orphaned_registry INT;
BEGIN
    -- 1. Find and delete groups with no items
    SELECT COUNT(*) INTO v_orphaned_groups
    FROM item_groups g
    WHERE NOT EXISTS (
        SELECT 1 FROM items i WHERE i.group_id = g.id
    );

    DELETE FROM item_groups g
    WHERE NOT EXISTS (
        SELECT 1 FROM items i WHERE i.group_id = g.id
    );

    RAISE NOTICE 'Deleted % orphaned group(s)', v_orphaned_groups;

    -- 2. Find and delete registry entries with no items
    SELECT COUNT(*) INTO v_orphaned_registry
    FROM item_name_to_group_registry r
    WHERE NOT EXISTS (
        SELECT 1 FROM items i WHERE i.name_to_group_id = r.id
    );

    DELETE FROM item_name_to_group_registry r
    WHERE NOT EXISTS (
        SELECT 1 FROM items i WHERE i.name_to_group_id = r.id
    );

    RAISE NOTICE 'Deleted % orphaned registry entrie(s)', v_orphaned_registry;

    RAISE NOTICE 'Cleanup complete.';
END $$;