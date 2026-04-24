-- Walkie Talkie: lock down the increment_usage RPC.
--
-- The initial migration created this function with SECURITY DEFINER so our
-- serverless functions (using service_role) could upsert-and-increment usage
-- in one atomic query. Problem: by default Supabase grants EXECUTE on new
-- functions to the anon + authenticated roles, which means any signed-in user
-- could call:
--
--   supabase.rpc('increment_usage', { p_user_id: '<victim>', p_seconds: 999999 })
--
-- …and burn another user's free trial (or their own, to force the paywall).
-- This migration revokes those grants so only service_role can call it.

revoke execute on function public.increment_usage(uuid, integer) from public;
revoke execute on function public.increment_usage(uuid, integer) from anon;
revoke execute on function public.increment_usage(uuid, integer) from authenticated;
