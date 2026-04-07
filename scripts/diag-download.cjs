// Compare file on disk vs what HTTP serves (simulating the browser download path)
const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')

const FILE_ON_DISK = path.resolve(
  'uploads/2026-04-07/AMTI26040601SARI_DAISHO_AMTI_BAUT_DIA_10.9_4ed19678.xlsm',
)
// Adjust port/protocol as needed
const URL =
  'http://localhost:4001/api/files/2026-04-07/AMTI26040601SARI_DAISHO_AMTI_BAUT_DIA_10.9_4ed19678.xlsm'

const diskBuf = fs.readFileSync(FILE_ON_DISK)
console.log('File on disk :', diskBuf.length, 'bytes')
console.log('Magic        :', diskBuf.slice(0, 4).toString('hex'))

// Need auth token — read from env or hardcode for test
const TOKEN = process.env.AUTH_TOKEN || ''

const options = new (require('url').URL)(URL)
const mod = options.protocol === 'https:' ? https : http

const req = mod.get(
  URL,
  {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
    rejectUnauthorized: false,
  },
  (res) => {
    console.log('\nHTTP status  :', res.statusCode)
    console.log('Content-Type :', res.headers['content-type'])
    console.log('Content-Disp :', res.headers['content-disposition'])
    console.log('Content-Len  :', res.headers['content-length'])

    const chunks = []
    res.on('data', (chunk) => chunks.push(chunk))
    res.on('end', () => {
      const httpBuf = Buffer.concat(chunks)
      console.log('\nHTTP body    :', httpBuf.length, 'bytes')
      console.log('Magic        :', httpBuf.slice(0, 4).toString('hex'))
      console.log('Identical?   :', diskBuf.equals(httpBuf) ? 'YES ✓' : 'NO ✗')

      if (!diskBuf.equals(httpBuf)) {
        // Find first difference
        const minLen = Math.min(diskBuf.length, httpBuf.length)
        for (let i = 0; i < minLen; i++) {
          if (diskBuf[i] !== httpBuf[i]) {
            console.log(
              `First diff at byte ${i}: disk=0x${diskBuf[i].toString(16)} http=0x${httpBuf[i].toString(16)}`,
            )
            break
          }
        }
        if (diskBuf.length !== httpBuf.length) {
          console.log(
            `Size diff: disk=${diskBuf.length} http=${httpBuf.length}`,
          )
        }
      }
    })
  },
)
req.on('error', (e) => console.error('Request failed:', e.message))
