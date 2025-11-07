import { createClient } from '@supabase/supabase-js'

export async function POST(request, env) {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY, { global: { fetch } })

    const { username, password } = await request.json()

    const { data, error } = await supabase
        .from('users')
        .insert([{ username, password }])
        .select()

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 })

    return new Response(JSON.stringify({ user: data[0] }), { status: 200 })
}
