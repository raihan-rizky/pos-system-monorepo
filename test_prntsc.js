fetch('https://prnt.sc/tlGLDdscQmC8', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }).then(r => r.text()).then(t => { 
  console.warn("LENGTH:", t.length);
  const match = t.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  console.warn("MATCH:", match ? match[1] : null);
})
