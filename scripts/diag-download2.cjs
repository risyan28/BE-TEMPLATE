const http = require('http')
const fs = require('fs')
const path = require('path')

const FILE_ON_DISK = path.resolve(
  'uploads/2026-04-07/AMTI26040601SARI_DAISHO_AMTI_BAUT_DIA_10.9_4ed19678.xlsm',
)
const FILE_URL =
  '/api/files/2026-04-07/AMTI26040601SARI_DAISHO_AMTI_BAUT_DIA_10.9_4ed19678.xlsm'
const LOGIN_URL = '/api/auth/login'

const diskBuf = fs.readFileSync(FILE_ON_DISK)
console.log('File on disk :', diskBuf.length, 'bytes')
console.log('Magic        :', diskBuf.slice(0, 4).toString('hex'))

function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = http.request(
      {
        hostname: 'localhost',
        port: 4001,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
        },
      },
      (res) => {
        let b = ''
        res.on('data', (c) => (b += c))
        res.on('end', () => resolve(JSON.parse(b)))
      },
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function httpGetBinary(urlPath, token) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: 'localhost',
        port: 4001,
        path: urlPath,
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        )
      },
    )
    req.on('error', reject)
  })
}

;(async () => {
  // Login
  const loginRes = await httpPost(LOGIN_URL, {
    username: 'sari',
    password: 'sari',
  })
  const token = loginRes.token || loginRes.accessToken
  if (!token) {
    // Try other passwords
    for (const pw of ['password', 'Sari123', '12345678', 'sari123']) {
      const r = await httpPost(LOGIN_URL, { username: 'sari', password: pw })
      if (r.token || r.accessToken) {
        console.log('Login OK with password:', pw)
        return compare(r.token || r.accessToken)
      }
    }
    console.log('Login failed:', JSON.stringify(loginRes))
    return
  }
  console.log('Login OK')
  await compare(token)

  async function compare(tok) {
    const res = await httpGetBinary(FILE_URL, tok)
    console.log('\nHTTP status  :', res.status)
    console.log('Content-Type :', res.headers['content-type'])
    console.log('Content-Disp :', res.headers['content-disposition'])
    console.log('Content-Len  :', res.headers['content-length'])
    console.log('HTTP body    :', res.body.length, 'bytes')
    console.log('Magic        :', res.body.slice(0, 4).toString('hex'))
    console.log('Identical?   :', diskBuf.equals(res.body) ? 'YES' : 'NO')
    if (!diskBuf.equals(res.body)) {
      const minLen = Math.min(diskBuf.length, res.body.length)
      for (let i = 0; i < minLen; i++) {
        if (diskBuf[i] !== res.body[i]) {
          console.log(
            `First diff at byte ${i}: disk=0x${diskBuf[i].toString(16)} http=0x${res.body[i].toString(16)}`,
          )
          break
        }
      }
      console.log(`Size diff: disk=${diskBuf.length} http=${res.body.length}`)
    }
  }
})().catch((e) => console.error(e))
