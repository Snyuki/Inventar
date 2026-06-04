-- ============================================================
-- Inventar — Vollständiges Datenbank-Setup Script
-- Für ein frisches Supabase Projekt (z.B. inventar-dev)
-- ============================================================


-- ------------------------------------------------------------
-- 1. Storages
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS storages (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name    TEXT NOT NULL UNIQUE
);

COMMENT ON TABLE storages IS
    'Lookup-Tabelle für die verfügbaren Lagerorte. Wird einmalig befüllt und ist nicht vom User editierbar.';

INSERT INTO storages (name) VALUES
    ('Kühlschrank'),
    ('Tiefkühler'),
    ('Abseite')
ON CONFLICT (name) DO NOTHING;


-- ------------------------------------------------------------
-- 2. Item Groups
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_groups (
    id          CHARACTER VARYING PRIMARY KEY,
    group_name  CHARACTER VARYING NOT NULL,
    storage_id  UUID NOT NULL REFERENCES storages(id)
);

COMMENT ON TABLE item_groups IS
    'Aktive Gruppen pro Lagerort (z.B. "Käse" im Kühlschrank).';
COMMENT ON COLUMN item_groups.storage_id IS
    'Lagerort dieser Gruppe. Gruppen sind storage-spezifisch.';

CREATE INDEX IF NOT EXISTS idx_item_groups_storage_id ON item_groups(storage_id);

DO $$ BEGIN
    ALTER TABLE item_groups ADD CONSTRAINT uq_item_groups_name_storage UNIQUE (group_name, storage_id);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;


-- ------------------------------------------------------------
-- 3. Group Templates
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_templates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_name  TEXT NOT NULL
);

COMMENT ON TABLE group_templates IS
    'Vorlage aller möglichen Gruppen. Wird im Frontend als Dropdown angezeigt. Nur per Admin-Script erweiterbar.';

INSERT INTO group_templates (group_name) VALUES
    ('Milch'),
    ('Käse'),
    ('Eier'),
    ('Jogurt'),
    ('Sahne'),
    ('Wurst & Fleisch'),
    ('Aufschnitt'),
    ('Fisch & Meeresfrüchte'),
    ('Brot'),
    ('Obst'),
    ('Gemüse'),
    ('Tofu'),
    ('Getränke'),
    ('Gewürze'),
    ('Saucen'),
    ('Dips'),
    ('Aufstriche'),
    ('Öl'),
    ('Reste'),
    ('Sonstiges')
ON CONFLICT DO NOTHING;


-- ------------------------------------------------------------
-- 4. Item Name to Group Registry
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_name_to_group_registry (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name   TEXT NOT NULL UNIQUE,
    group_id    TEXT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT now(),
    ean         TEXT
);

COMMENT ON TABLE item_name_to_group_registry IS
    'Verknüpft bekannte Item-Namen mit ihrer Gruppe. Dient als Lookup-Cache und Gruppenvorschlag.';
COMMENT ON COLUMN item_name_to_group_registry.ean IS
    'EAN des Produkts, sofern per Barcode-Scan hinzugefügt. Verknüpft mit ean_product_cache.';


-- ------------------------------------------------------------
-- 5. Items
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
    id                CHARACTER VARYING PRIMARY KEY,
    group_id          CHARACTER VARYING NOT NULL,
    kaufdatum         CHARACTER VARYING NOT NULL,
    ablaufdatum       CHARACTER VARYING,
    name_to_group_id  UUID REFERENCES item_name_to_group_registry(id),
    storage_id        UUID NOT NULL REFERENCES storages(id)
);

COMMENT ON TABLE items IS
    'Einzelne Items im Inventar.';
COMMENT ON COLUMN items.storage_id IS
    'Lagerort dieses Items. FK auf storages.id.';
COMMENT ON COLUMN items.name_to_group_id IS
    'Verweis auf den Registry-Eintrag der den Item-Namen und die Gruppe verknüpft.';

CREATE INDEX IF NOT EXISTS idx_items_storage_id ON items(storage_id);


-- ------------------------------------------------------------
-- 6. EAN Product Cache
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ean_product_cache (
    ean           TEXT PRIMARY KEY,
    product_name  TEXT,
    brand         TEXT,
    quantity      TEXT,
    categories    TEXT[],
    stores        TEXT[],
    nutrition     JSONB,
    allergens     TEXT[],
    ingredients   TEXT,
    fetched_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE ean_product_cache IS
    'Cache für EAN-Lookups. Wird beim ersten Scan eines Produkts befüllt und erspart zukünftige Abfragen an die Open Food Facts API.';
COMMENT ON COLUMN ean_product_cache.ean IS
    'EAN-13 (oder EAN-8) Barcode als Text, dient als Primary Key.';
COMMENT ON COLUMN ean_product_cache.nutrition IS
    'Nährwertangaben als JSONB (pro 100g).';


-- ------------------------------------------------------------
-- 7. Open Food Facts Category Mapping
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS off_category_mapping (
    off_category    TEXT PRIMARY KEY,
    app_group_name  TEXT NOT NULL
);

COMMENT ON TABLE off_category_mapping IS
    'Mapping von Open Food Facts Kategorien zu den Gruppen dieser App.';

INSERT INTO off_category_mapping (off_category, app_group_name) VALUES
    -- Milch
    ('en:milks',                        'Milch'),
    ('en:milk',                         'Milch'),
    ('dairies',                         'Milch'),
    ('en:plant-based-milks',            'Milch'),

    -- Käse
    ('en:cheeses',                      'Käse'),
    ('en:cheese',                       'Käse'),
    ('cheeses',                         'Käse'),
    ('en:fresh-cheeses',                'Käse'),
    ('en:soft-cheeses',                 'Käse'),
    ('en:hard-cheeses',                 'Käse'),

    -- Jogurt
    ('en:yogurts',                      'Jogurt'),
    ('en:yogurt',                       'Jogurt'),
    ('yogurts',                         'Jogurt'),
    ('en:fermented-milks',              'Jogurt'),
    ('en:skyr',                         'Jogurt'),

    -- Sahne
    ('en:creams',                       'Sahne'),
    ('en:cream',                        'Sahne'),
    ('en:whipping-creams',              'Sahne'),
    ('en:sour-creams',                  'Sahne'),
    ('en:creme-fraiche',                'Sahne'),

    -- Eier
    ('en:eggs',                         'Eier'),
    ('en:egg',                          'Eier'),
    ('eggs',                            'Eier'),

    -- Wurst & Fleisch
    ('en:meats',                        'Wurst & Fleisch'),
    ('en:meat',                         'Wurst & Fleisch'),
    ('en:sausages',                     'Wurst & Fleisch'),
    ('en:poultry',                      'Wurst & Fleisch'),
    ('en:beef',                         'Wurst & Fleisch'),
    ('en:pork',                         'Wurst & Fleisch'),
    ('en:hams',                         'Wurst & Fleisch'),

    -- Aufschnitt
    ('en:deli-meats',                   'Aufschnitt'),
    ('en:cold-cuts',                    'Aufschnitt'),
    ('en:sliced-meats',                 'Aufschnitt'),

    -- Fisch & Meeresfrüchte
    ('en:fishes',                       'Fisch & Meeresfrüchte'),
    ('en:fish',                         'Fisch & Meeresfrüchte'),
    ('en:seafood',                      'Fisch & Meeresfrüchte'),
    ('en:shellfishes',                  'Fisch & Meeresfrüchte'),
    ('en:smoked-fishes',                'Fisch & Meeresfrüchte'),
    ('en:salmons',                      'Fisch & Meeresfrüchte'),

    -- Brot
    ('en:breads',                       'Brot'),
    ('en:bread',                        'Brot'),
    ('en:sourdough-breads',             'Brot'),
    ('en:toast-breads',                 'Brot'),
    ('en:rolls',                        'Brot'),
    ('en:pastries',                     'Brot'),

    -- Obst
    ('en:fruits',                       'Obst'),
    ('en:fruit',                        'Obst'),
    ('en:fresh-fruits',                 'Obst'),
    ('en:berries',                      'Obst'),
    ('en:citrus',                       'Obst'),

    -- Gemüse
    ('en:vegetables',                   'Gemüse'),
    ('en:vegetable',                    'Gemüse'),
    ('en:fresh-vegetables',             'Gemüse'),
    ('en:salads',                       'Gemüse'),
    ('en:leafy-vegetables',             'Gemüse'),

    -- Tofu
    ('en:tofu',                         'Tofu'),
    ('en:soy-based-foods',              'Tofu'),
    ('en:tempeh',                       'Tofu'),

    -- Getränke
    ('en:beverages',                    'Getränke'),
    ('en:drinks',                       'Getränke'),
    ('en:juices',                       'Getränke'),
    ('en:waters',                       'Getränke'),
    ('en:sodas',                        'Getränke'),
    ('en:coffees',                      'Getränke'),
    ('en:teas',                         'Getränke'),

    -- Gewürze
    ('en:spices',                       'Gewürze'),
    ('en:herbs',                        'Gewürze'),
    ('en:condiments',                   'Gewürze'),
    ('en:seasonings',                   'Gewürze'),

    -- Saucen
    ('en:sauces',                       'Saucen'),
    ('en:ketchup',                      'Saucen'),
    ('en:mustards',                     'Saucen'),
    ('en:hot-sauces',                   'Saucen'),

    -- Dips
    ('en:dips',                         'Dips'),
    ('en:hummus',                       'Dips'),
    ('en:guacamole',                    'Dips'),

    -- Aufstriche
    ('en:spreads',                      'Aufstriche'),
    ('en:jams',                         'Aufstriche'),
    ('en:nut-butters',                  'Aufstriche'),
    ('en:marmalades',                   'Aufstriche'),
    ('en:honey',                        'Aufstriche'),
    ('en:butters',                      'Aufstriche'),

    -- Öl
    ('en:oils',                         'Öl'),
    ('en:olive-oils',                   'Öl'),
    ('en:cooking-oils',                 'Öl'),
    ('en:vegetable-oils',               'Öl')

ON CONFLICT (off_category) DO NOTHING;

-- ------------------------------------------------------------
-- 8. CRUD Audit Log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crud_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_email  TEXT NOT NULL,
    action      TEXT NOT NULL,        -- 'CREATE', 'UPDATE', 'DELETE'
    entity_type TEXT NOT NULL,        -- 'item', 'group'
    entity_id   TEXT NOT NULL,
    payload     JSONB
);

COMMENT ON TABLE crud_logs IS
    'Audit-Log aller schreibenden Datenbankoperationen. Wird automatisch vom Backend befüllt.';
COMMENT ON COLUMN crud_logs.action IS
    'Art der Operation: CREATE, UPDATE oder DELETE.';
COMMENT ON COLUMN crud_logs.entity_type IS
    'Typ der betroffenen Entität: item oder group.';
COMMENT ON COLUMN crud_logs.payload IS
    'Kontextdaten zur Operation (z.B. Name, Gruppe, alte/neue Werte).';

CREATE INDEX IF NOT EXISTS idx_crud_logs_timestamp   ON crud_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_crud_logs_user_email  ON crud_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_crud_logs_entity_type ON crud_logs(entity_type);


-- ------------------------------------------------------------
-- 9. Auto-Restock fields on item_name_to_group_registry
-- ------------------------------------------------------------
ALTER TABLE item_name_to_group_registry
    ADD COLUMN IF NOT EXISTS auto_restock   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS min_stock      INTEGER,
    ADD COLUMN IF NOT EXISTS restock_target INTEGER;

COMMENT ON COLUMN item_name_to_group_registry.auto_restock IS
    'Gibt an ob das Item automatisch zur Einkaufsliste hinzugefügt wird wenn der Vorrat unter min_stock fällt.';
COMMENT ON COLUMN item_name_to_group_registry.min_stock IS
    'Minimaler Vorrat bevor das Item zur Einkaufsliste hinzugefügt wird. Nur relevant wenn auto_restock = TRUE.';
COMMENT ON COLUMN item_name_to_group_registry.restock_target IS
    'Zielbestand nach dem Einkauf. Differenz zu aktuellem Bestand ergibt die Einkaufsmenge. Nur relevant wenn auto_restock = TRUE.';


-- ------------------------------------------------------------
-- 10. Shopping List (Einkaufsliste)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shopping_list (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    item_name       TEXT NOT NULL,
    quantity        INTEGER NOT NULL DEFAULT 1,
    source          TEXT NOT NULL DEFAULT 'manual', -- 'manual' or 'auto'
    registry_id     UUID REFERENCES item_name_to_group_registry(id) ON DELETE SET NULL,
    checked_off     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_checked_off ON shopping_list(checked_off);
CREATE INDEX IF NOT EXISTS idx_shopping_list_registry_id ON shopping_list(registry_id);

COMMENT ON TABLE shopping_list IS
    'Einkaufsliste. Einträge werden manuell oder automatisch via Auto-Restock hinzugefügt.';
COMMENT ON COLUMN shopping_list.source IS
    'Ursprung des Eintrags: manual (manuell) oder auto (Auto-Restock-Trigger).';
COMMENT ON COLUMN shopping_list.registry_id IS
    'Verweis auf item_name_to_group_registry. NULL für temporäre Items die nicht in der DB existieren.';