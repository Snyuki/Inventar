"""
The time window in minutes, the user has to detect wrong inserts
of Item to Group Links. When the user deletes all items with this
name in the given time, the link also gets removed without involvement
of admins.
"""
REGISTRY_GRACE_PERIOD_MINUTES = 15