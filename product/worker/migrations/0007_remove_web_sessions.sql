-- The product is Android-only. Revoke web-specific sessions without touching
-- Android sessions, personal passwords, legacy APK tokens, or business data.
DELETE FROM app_sessions WHERE kind='web';
