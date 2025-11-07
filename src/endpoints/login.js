import { createClient } from '@supabase/supabase-js'

export async function POST(request, env) {
    console.log("SUPABASE_URL:", env.SUPABASE_URL)
    console.log("SUPABASE_KEY:", env.SUPABASE_KEY)

    try {
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY, {
            global: { fetch },
        })

        const body = await request.json()
        console.log("Login request body:", body)   // 🔹 stampa username/password

        const { username, password } = body

        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .single()

        if (error || !data) {
            console.log("Login failed:", error)     // 🔹 stampa errore Supabase
            return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 })
        }

        console.log("Login success:", data)       // 🔹 stampa utente trovato
        return new Response(JSON.stringify({ user: data }), { status: 200 })

    } catch (err) {
        console.log("Login exception:", err)
        return new Response(JSON.stringify({ error: err.message }), { status: 500 })
    }
}
