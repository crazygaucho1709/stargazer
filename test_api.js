fetch('http://127.0.0.1:3000/api/indi/mount', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'slew', ra: 83.821, dec: -5.391, ip: '127.0.0.1:5005' })
})
.then(res => res.json())
.then(data => console.log('Response:', data))
.catch(err => console.error('Fetch error:', err));
