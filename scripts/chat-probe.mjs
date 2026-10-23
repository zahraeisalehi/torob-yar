// Probe the chat pipeline turn by turn. usage: node scripts/chat-probe.mjs <base> "msg1" "msg2" "@refine" ...
const [base, ...steps] = process.argv.slice(2);
const messages = [];
let state;
for (const s of steps) {
  const body = s === '@refine' ? { messages, state, action: 'refine' } : (messages.push({ role: 'user', text: s }), { messages, state });
  const t = Date.now();
  const r = await (await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  state = r.state;
  console.log(`> ${s}  [${Date.now() - t} ms, ${r.mode}]`);
  for (const b of r.blocks) {
    if (b.type === 'question') {
      console.log('  Q:', b.question, '|', b.replies.join(' / '));
      messages.push({ role: 'assistant', text: b.question });
    } else if (b.type === 'products') console.log('  P:', b.products.map((p) => `${p.title.slice(0, 40)} ${p.minPrice}`).join(' || '));
    else console.log(' ', b.type, JSON.stringify(b).slice(0, 160));
  }
}
