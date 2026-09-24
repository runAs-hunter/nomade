-- F1.2 local seed strategy (safe for `supabase db reset`)
--
-- Rules:
-- - No production data.
-- - Do NOT copy founder italy.yaml / prototype notes into approved claims.
-- - Prefer empty or fixture rows that exercise schema only.
-- - Real knowledge seeding arrives with later KB tasks after human review gates.
--
-- This file intentionally contains no DML yet so reset stays green.

select 1;
