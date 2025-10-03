# Pizza Counter MVP

## Environment Variables

Create a `.env.local` file in the project root with the following keys from your Supabase project:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

These values are exposed in the browser, so double-check that Row Level Security (RLS) policies cover all data access.
