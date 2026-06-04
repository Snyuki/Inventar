"""
The time window in minutes, the user has to detect wrong inserts
of Item to Group Links. When the user deletes all items with this
name in the given time, the link also gets removed without involvement
of admins.
"""
REGISTRY_GRACE_PERIOD_MINUTES = 15

"""
The fields that are queried from the Open Food Facts (OFF) Database API
in case of no local cache. This corresponds directly to what this app
is storing in its own database since everything is fetched from OFF.
"""
OFF_QUERY_CATEGORIES_STRING = "product_name,product_name_de,brands,quantity,categories_tags,stores_tags,nutriments,allergens_tags,ingredients_text"

"""
The time in seconds until the query to the OFF API timeouts.
"""
OFF_QUERY_TIMEOUT_IN_SECONDS = 8.0

"""
The Base URL to the OFF Database API.
"""
OFF_QUERY_BASE_URL = "https://world.openfoodfacts.org/api/v2/product"

"""
Shopping list source string for manual insertion
"""
SHOPPING_LIST_SOURCE_MANUAL = "manual"

"""
Shopping list source string for automatic insertion
"""
SHOPPING_LIST_SOURCE_AUTO   = "auto"