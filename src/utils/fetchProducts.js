const http = require('http');

http.get('http://127.0.0.1:5000/api/products', (res) => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    try {
      const body = Buffer.concat(chunks).toString('utf8');
      const parsed = JSON.parse(body);
      console.log('statusCode=', res.statusCode, 'dataCount=', Array.isArray(parsed.data) ? parsed.data.length : 'no-data');
      if (Array.isArray(parsed.data) && parsed.data.length > 0) console.log('first=', parsed.data[0].name || parsed.data[0].Full_Name || '<no name>');
    } catch (e) { console.error('parse error', e); console.log(body); }
    process.exit(0);
  });
}).on('error', e => { console.error('request error', e); process.exit(1); });
