console.log("Env vars starting with VITE_ or SUPABASE_:");
for (const key of Object.keys(process.env)) {
  if (key.startsWith("VITE_") || key.startsWith("SUPABASE_")) {
    console.log(`${key}: ${process.env[key] ? 'PRESENTE' : 'VAZIO'}`);
  }
}
