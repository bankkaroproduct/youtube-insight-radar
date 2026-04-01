

# Add IP Address to Whitelist

## What
Insert IP address `182.77.77.39` into the `ip_whitelist` table.

## How
Single SQL insert statement:
```sql
INSERT INTO ip_whitelist (ip_address, description, is_active)
VALUES ('182.77.77.39', NULL, true);
```

Current whitelist has 3 entries. This will be the 4th.

