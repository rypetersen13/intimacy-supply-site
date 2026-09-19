// Runs the real SFTP download code against a tiny local SFTP server.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { Server, utils } = require("ssh2");
const { _test } = require("../netlify/functions/sync-stock");

const DATA = Buffer.from("PRODUCTS_MODEL\tPRODUCTS_QUANTITY\nX1\t5\n".repeat(20000)); // ~ 800 KB, several read chunks
const { STATUS_CODE } = utils.sftp;

function startServer() {
  const hostKey = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "pkcs1", format: "pem" } }).privateKey;
  const server = new Server({ hostKeys: [hostKey] }, client => {
    client.on("authentication", ctx => (ctx.method === "password" && ctx.username === "feeduser" && ctx.password === "secret") ? ctx.accept() : ctx.reject());
    client.on("ready", () => client.on("session", accept => {
      accept().on("sftp", accept => {
        const sftp = accept(); let n = 0;
        sftp.on("OPEN", (req, filename) => {
          if (filename !== "feeds/product_feed.tsv") return sftp.status(req, STATUS_CODE.NO_SUCH_FILE);
          const h = Buffer.alloc(4); h.writeUInt32BE(n++); sftp.handle(req, h);
        });
        sftp.on("FSTAT", req => sftp.attrs(req, { mode: 0o100644, uid: 0, gid: 0, size: DATA.length, atime: 0, mtime: 0 }));
        sftp.on("READ", (req, h, offset, length) => offset >= DATA.length ? sftp.status(req, STATUS_CODE.EOF) : sftp.data(req, DATA.subarray(offset, offset + length)));
        sftp.on("CLOSE", req => sftp.status(req, STATUS_CODE.OK));
      });
    }));
  });
  return new Promise(res => server.listen(0, "127.0.0.1", () => res(server)));
}

test("fetchFeed downloads the whole file over SFTP", async () => {
  const server = await startServer();
  try {
    const text = await _test.fetchFeed({ host: "127.0.0.1", port: server.address().port, user: "feeduser", pass: "secret", path: "feeds/product_feed.tsv" });
    assert.equal(text.length, DATA.length);
    assert.ok(text.startsWith("PRODUCTS_MODEL\tPRODUCTS_QUANTITY"));
  } finally { server.close(); }
});

test("fetchFeed fails cleanly on a wrong password and on a missing file", async () => {
  const server = await startServer();
  try {
    const port = server.address().port;
    await assert.rejects(_test.fetchFeed({ host: "127.0.0.1", port, user: "feeduser", pass: "wrong", path: "feeds/product_feed.tsv" }));
    await assert.rejects(_test.fetchFeed({ host: "127.0.0.1", port, user: "feeduser", pass: "secret", path: "feeds/nope.tsv" }));
  } finally { server.close(); }
});
