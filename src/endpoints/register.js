import { createClient } from '@supabase/supabase-js'

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY, {
    // necessario per i Workers
    global: {
        fetch,
    },
})

export async function POST(request) {
    try {
        const { username, password } = await request.json()

        // ⚠️ Solo MVP: in produzione hashare la password
        const { data, error } = await supabase
            .from('users')
            .insert([{ username, password }])
            .select()

        if (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 400 })
        }

        return new Response(JSON.stringify({ user: data[0] }), { status: 200 })
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 })
    }
}
