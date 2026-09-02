import { readFileSync } from "node:fs";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
const env = JSON.parse(readFileSync(process.env.ENVFILE, "utf8"));
const s3 = new S3Client({
  region: env.S3_REGION, endpoint: env.S3_ENDPOINT, forcePathStyle: true,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});
const Key = "tmp/lgpd-proof-bloco4";
const acao = process.argv[2];
if (acao === "put") {
  await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key, Body: Buffer.from("prova-lgpd"), ContentType: "video/mp4" }));
  console.log("objeto de teste criado:", Key);
} else {
  try { await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key })); console.log("EXISTE"); }
  catch { console.log("AUSENTE"); }
}
